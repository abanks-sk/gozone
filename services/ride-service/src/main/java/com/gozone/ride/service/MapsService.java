package com.gozone.ride.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Backend proxy for the Google Maps web-service APIs (Directions, Places New, Geocoding).
 * The billable SERVER key lives here only — never in the app. When the key is blank the
 * proxy returns empty results so the client falls back (straight-line route / no search).
 */
@Service
public class MapsService {

    private static final Logger log = LoggerFactory.getLogger(MapsService.class);

    @Value("${app.maps.server-key:}")
    private String key;

    private final RestTemplate rest = new RestTemplate();

    public boolean enabled() {
        return key != null && !key.isBlank();
    }

    /** Road route between two points → decoded polyline points + distance/duration. */
    public Map<String, Object> directions(double oLat, double oLng, double dLat, double dLng) {
        if (!enabled()) return osrmDirections(oLat, oLng, dLat, dLng);
        try {
            String url = UriComponentsBuilder.fromHttpUrl("https://maps.googleapis.com/maps/api/directions/json")
                .queryParam("origin", oLat + "," + oLng)
                .queryParam("destination", dLat + "," + dLng)
                .queryParam("mode", "driving")
                .queryParam("key", key)
                .toUriString();
            JsonNode root = rest.getForObject(url, JsonNode.class);
            if (root != null && "OK".equals(root.path("status").asText()) && root.path("routes").size() > 0) {
                JsonNode route = root.path("routes").get(0);
                List<Map<String, Double>> points = decodePolyline(route.path("overview_polyline").path("points").asText());
                JsonNode leg = route.path("legs").get(0);
                return Map.of(
                    "points", points,
                    "distanceMeters", leg.path("distance").path("value").asInt(),
                    "durationSeconds", leg.path("duration").path("value").asInt(),
                    "enabled", true);
            }
            // Surface Google's reason (e.g. key/IP restriction) — status alone isn't diagnosable.
            log.warn("[MAPS] directions status={} error={}",
                root != null ? root.path("status").asText() : "null",
                root != null ? root.path("error_message").asText("") : "");
        } catch (Exception e) {
            log.error("[MAPS] directions failed: {}", e.getMessage());
        }
        // Google said no — most often because the server key is IP-restricted and the machine's
        // address has changed. Fall back to a real road route rather than letting the apps draw a
        // straight line through buildings.
        return osrmDirections(oLat, oLng, dLat, dLng);
    }

    /**
     * Road route from OSRM's public demo server — no key, no IP allowlist.
     *
     * <p>This exists so routing degrades to "still a real route" instead of "a straight line".
     * The apps' own last resort is a straight line, and that is what a viewer notices first: a
     * path cutting across blocks and water. OSRM is best-effort (public instance, no SLA), so a
     * failure here simply returns empty and the app falls back as before.
     */
    private Map<String, Object> osrmDirections(double oLat, double oLng, double dLat, double dLng) {
        try {
            String url = String.format(
                "https://router.project-osrm.org/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=polyline",
                oLng, oLat, dLng, dLat);
            JsonNode root = rest.getForObject(url, JsonNode.class);
            if (root != null && "Ok".equalsIgnoreCase(root.path("code").asText())
                    && root.path("routes").size() > 0) {
                JsonNode route = root.path("routes").get(0);
                List<Map<String, Double>> points = decodePolyline(route.path("geometry").asText());
                log.info("[MAPS] routed via OSRM ({} points)", points.size());
                return Map.of(
                    "points", points,
                    "distanceMeters", (int) route.path("distance").asDouble(),
                    "durationSeconds", (int) route.path("duration").asDouble(),
                    "enabled", true);
            }
        } catch (Exception e) {
            log.error("[MAPS] OSRM fallback failed: {}", e.getMessage());
        }
        return Map.of("points", List.of(), "distanceMeters", 0, "durationSeconds", 0, "enabled", enabled());
    }

    /** Place autocomplete (Places API New) → [{placeId, description}]. */
    public List<Map<String, String>> autocomplete(String input) {
        if (!enabled() || input == null || input.isBlank()) return List.of();
        try {
            HttpHeaders h = new HttpHeaders();
            h.setContentType(MediaType.APPLICATION_JSON);
            h.set("X-Goog-Api-Key", key);
            Map<String, Object> body = Map.of("input", input, "regionCode", "gh");
            JsonNode root = rest.postForObject("https://places.googleapis.com/v1/places:autocomplete",
                new HttpEntity<>(body, h), JsonNode.class);

            List<Map<String, String>> out = new ArrayList<>();
            if (root != null) {
                for (JsonNode s : root.path("suggestions")) {
                    JsonNode p = s.path("placePrediction");
                    if (!p.isMissingNode()) {
                        out.add(Map.of(
                            "placeId", p.path("placeId").asText(),
                            "description", p.path("text").path("text").asText()));
                    }
                }
            }
            return out;
        } catch (Exception e) {
            log.error("[MAPS] autocomplete failed: {}", e.getMessage());
            return List.of();
        }
    }

    /** Place details (Places API New) → {lat, lng, name, address}. */
    public Map<String, Object> placeDetails(String placeId) {
        if (!enabled() || placeId == null || placeId.isBlank()) return Map.of();
        try {
            HttpHeaders h = new HttpHeaders();
            h.set("X-Goog-Api-Key", key);
            h.set("X-Goog-FieldMask", "location,displayName,formattedAddress");
            JsonNode root = rest.exchange("https://places.googleapis.com/v1/places/" + placeId,
                HttpMethod.GET, new HttpEntity<>(h), JsonNode.class).getBody();
            if (root != null && root.has("location")) {
                return Map.of(
                    "lat", root.path("location").path("latitude").asDouble(),
                    "lng", root.path("location").path("longitude").asDouble(),
                    "name", root.path("displayName").path("text").asText(""),
                    "address", root.path("formattedAddress").asText(""));
            }
        } catch (Exception e) {
            log.error("[MAPS] placeDetails failed: {}", e.getMessage());
        }
        return Map.of();
    }

    /** Free-text place search → [{name, address, lat, lng}] in one call (Places New searchText). */
    public List<Map<String, Object>> searchPlaces(String query) {
        if (!enabled() || query == null || query.isBlank()) return List.of();
        try {
            HttpHeaders h = new HttpHeaders();
            h.setContentType(MediaType.APPLICATION_JSON);
            h.set("X-Goog-Api-Key", key);
            h.set("X-Goog-FieldMask", "places.displayName,places.formattedAddress,places.location");
            Map<String, Object> body = Map.of("textQuery", query, "regionCode", "gh", "maxResultCount", 6);

            JsonNode root = rest.postForObject("https://places.googleapis.com/v1/places:searchText",
                new HttpEntity<>(body, h), JsonNode.class);

            List<Map<String, Object>> out = new ArrayList<>();
            if (root != null) {
                for (JsonNode p : root.path("places")) {
                    out.add(Map.of(
                        "name", p.path("displayName").path("text").asText(""),
                        "address", p.path("formattedAddress").asText(""),
                        "lat", p.path("location").path("latitude").asDouble(),
                        "lng", p.path("location").path("longitude").asDouble()));
                }
            }
            return out;
        } catch (Exception e) {
            log.error("[MAPS] searchPlaces failed: {}", e.getMessage());
            return List.of();
        }
    }

    /** True for Google "plus codes" like MC4R+72C, which are not useful place names. */
    private static boolean isPlusCode(String s) {
        return s != null && s.matches("^[23456789CFGHJMPQRVWX]{4,8}\\+[23456789CFGHJMPQRVWX]{2,3}$");
    }

    /**
     * Coordinate → a human place name. Tries Places "nearby" first so real POIs
     * (a hostel, a shop) win; falls back to Geocoding, skipping plus-code results.
     */
    public Map<String, Object> reverseGeocode(double lat, double lng) {
        if (!enabled()) return Map.of();

        // 1) Nearest named place (this is what gives you "X Hostel" instead of a code).
        try {
            HttpHeaders h = new HttpHeaders();
            h.setContentType(MediaType.APPLICATION_JSON);
            h.set("X-Goog-Api-Key", key);
            h.set("X-Goog-FieldMask", "places.displayName,places.formattedAddress");
            Map<String, Object> body = Map.of(
                "maxResultCount", 1,
                "locationRestriction", Map.of("circle", Map.of(
                    "center", Map.of("latitude", lat, "longitude", lng),
                    "radius", 75.0)));

            JsonNode root = rest.postForObject("https://places.googleapis.com/v1/places:searchNearby",
                new HttpEntity<>(body, h), JsonNode.class);

            if (root != null && root.path("places").size() > 0) {
                JsonNode p = root.path("places").get(0);
                String name = p.path("displayName").path("text").asText("");
                if (!name.isBlank() && !isPlusCode(name)) {
                    return Map.of("name", name, "address", p.path("formattedAddress").asText(""));
                }
            }
        } catch (Exception e) {
            log.warn("[MAPS] nearby lookup failed, falling back to geocoding: {}", e.getMessage());
        }

        // 2) Street address fallback.
        try {
            String url = UriComponentsBuilder.fromHttpUrl("https://maps.googleapis.com/maps/api/geocode/json")
                .queryParam("latlng", lat + "," + lng)
                .queryParam("key", key)
                .toUriString();
            JsonNode root = rest.getForObject(url, JsonNode.class);
            if (root != null && "OK".equals(root.path("status").asText()) && root.path("results").size() > 0) {
                // Prefer a result that isn't a plus-code entry (those look like "MC4R+72C").
                JsonNode chosen = null;
                for (JsonNode r : root.path("results")) {
                    boolean plus = false;
                    for (JsonNode t : r.path("types")) {
                        if ("plus_code".equals(t.asText())) { plus = true; break; }
                    }
                    if (!plus && !isPlusCode(r.path("formatted_address").asText("").split(",")[0].trim())) {
                        chosen = r;
                        break;
                    }
                }
                if (chosen == null) chosen = root.path("results").get(0);

                // First component that isn't itself a plus code makes the best short label.
                String name = "";
                for (JsonNode comp : chosen.path("address_components")) {
                    String v = comp.path("long_name").asText("");
                    if (!v.isBlank() && !isPlusCode(v)) { name = v; break; }
                }
                String address = chosen.path("formatted_address").asText("");
                // Drop a leading plus-code token from the address line, e.g. "MC4R+72C, Kumasi".
                String[] parts = address.split(",");
                if (parts.length > 1 && isPlusCode(parts[0].trim())) {
                    address = String.join(",", java.util.Arrays.copyOfRange(parts, 1, parts.length)).trim();
                }
                return Map.of("address", address, "name", name);
            }
            log.warn("[MAPS] reverseGeocode status={} error={}",
                root != null ? root.path("status").asText() : "null",
                root != null ? root.path("error_message").asText("") : "");
        } catch (Exception e) {
            log.error("[MAPS] reverseGeocode failed: {}", e.getMessage());
        }
        return Map.of();
    }

    /** Decode a Google encoded polyline into a list of {lat, lng}. */
    private static List<Map<String, Double>> decodePolyline(String encoded) {
        List<Map<String, Double>> path = new ArrayList<>();
        int index = 0, len = encoded.length(), lat = 0, lng = 0;
        while (index < len) {
            int b, shift = 0, result = 0;
            do { b = encoded.charAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lat += ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
            shift = 0; result = 0;
            do { b = encoded.charAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
            lng += ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
            path.add(Map.of("lat", lat / 1e5, "lng", lng / 1e5));
        }
        return path;
    }
}
