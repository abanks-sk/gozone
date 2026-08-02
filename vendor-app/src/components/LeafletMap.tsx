import React, { useEffect, useRef, useState } from 'react';
import { Platform, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../theme/ThemeProvider';

// Real map via Leaflet + OpenStreetMap/Carto tiles, rendered in a WebView (native)
// or an iframe (web). No native build, no API key. Two modes:
//   - "picker": a pin fixed at screen-centre; panning the map reports the centre coord.
//   - "view":   static markers + an optional live `driver` marker + optional `route`.

export interface LatLng { lat: number; lng: number }
export interface MapMarker extends LatLng { kind?: 'pickup' | 'dest' | 'driver' | 'plain'; label?: string }

interface Props {
  style?: ViewStyle;
  center: LatLng;
  zoom?: number;
  mode?: 'picker' | 'view';
  markers?: MapMarker[];
  driver?: LatLng | null;   // live-updated without reloading the map
  vehicleKind?: 'car' | 'bike' | 'truck'; // what that marker is drawn as (see mapTypes)
  userLocation?: LatLng | null; // the device's own location (blue dot)
  flyTo?: LatLng | null;    // recenter the map when this changes
  route?: LatLng[];
  onCenterChange?: (p: LatLng) => void;
  onReady?: () => void;
}

function buildHtml(opts: {
  tileUrl: string; center: LatLng; zoom: number; mode: string;
  markers: MapMarker[]; driver: LatLng | null; user: LatLng | null; route: LatLng[]; primary: string;
  vehicleKind: string;
}): string {
  const { tileUrl, center, zoom, mode, markers, driver, user, route, primary, vehicleKind } = opts;
  const data = JSON.stringify({ center, zoom, mode, markers, driver, user, route, primary, tileUrl, vehicleKind });
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#000}
  .leaflet-control-attribution{font-size:9px}
  #pin{position:absolute;left:50%;top:50%;transform:translate(-50%,-100%);z-index:500;pointer-events:none}
  #pin svg{filter:drop-shadow(0 4px 5px rgba(0,0,0,.4))}
  #dot{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:rgba(0,0,0,.25);z-index:499;pointer-events:none}
</style></head><body>
<div id="map"></div>
${mode === 'picker' ? `<div id="dot"></div><div id="pin"><svg width="34" height="46" viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.4 0 12c0 8 12 20 12 20s12-12 12-20C24 5.4 18.6 0 12 0z" fill="${primary}"/><circle cx="12" cy="12" r="5" fill="#fff"/></svg></div>` : ''}
<script>
  var CFG = ${data};
  function post(o){ var s=JSON.stringify(o);
    if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}
    else if(window.parent){window.parent.postMessage(s,'*');} }

  var map = L.map('map',{zoomControl:false,attributionControl:true}).setView([CFG.center.lat,CFG.center.lng],CFG.zoom);
  L.tileLayer(CFG.tileUrl,{maxZoom:19,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);

  var COLORS={pickup:'#22c55e',dest:'#ef4444',plain:'#64748b'};
  function dot(m){ return L.circleMarker([m.lat,m.lng],{radius:8,color:'#fff',weight:2,fillColor:COLORS[m.kind]||COLORS.plain,fillOpacity:1}); }
  // A courier on an okada shouldn't appear as a saloon car — on the street that's the difference
  // between looking for a car and looking for a motorbike.
  var GLYPH={car:'🚗',bike:'🏍️',truck:'🚚'};
  function vehicleIcon(kind){ var g=GLYPH[kind||CFG.vehicleKind||'car']||GLYPH.car;
    return L.divIcon({className:'',html:'<div style="background:'+CFG.primary+';width:30px;height:30px;border-radius:15px;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;box-shadow:0 2px 6px rgba(0,0,0,.4)">'+g+'</div>',iconSize:[30,30],iconAnchor:[15,15]}); }
  function carIcon(){ return vehicleIcon(CFG.vehicleKind); }

  (CFG.markers||[]).forEach(function(m){ var mk = m.kind==='driver'?L.marker([m.lat,m.lng],{icon:carIcon()}):dot(m); mk.addTo(map); if(m.label){mk.bindTooltip(m.label,{permanent:false}); } });

  var driverMk=null;
  window.setDriver=function(lat,lng){ if(!driverMk){driverMk=L.marker([lat,lng],{icon:carIcon()}).addTo(map);} else {driverMk.setLatLng([lat,lng]);} };
  // The vehicle is only known once an offer is accepted, i.e. after this map has loaded.
  window.setVehicleKind=function(kind){ CFG.vehicleKind=kind; if(driverMk){driverMk.setIcon(vehicleIcon(kind));} };
  if(CFG.driver){ window.setDriver(CFG.driver.lat,CFG.driver.lng); }

  var userMk=null;
  window.setUser=function(lat,lng){ if(!userMk){userMk=L.circleMarker([lat,lng],{radius:7,color:'#fff',weight:3,fillColor:'#2563EB',fillOpacity:1}).addTo(map);} else {userMk.setLatLng([lat,lng]);} };
  if(CFG.user){ window.setUser(CFG.user.lat,CFG.user.lng); }

  window.flyTo=function(lat,lng,z){ map.setView([lat,lng], z||map.getZoom()); };

  var routeLine=null;
  window.setRoute=function(coords){ if(routeLine){map.removeLayer(routeLine);} routeLine=L.polyline(coords.map(function(p){return [p.lat,p.lng];}),{color:CFG.primary,weight:5,opacity:.8}).addTo(map); };
  if(CFG.route && CFG.route.length){ window.setRoute(CFG.route); try{ map.fitBounds(routeLine.getBounds(),{padding:[60,60]}); }catch(e){} }

  if(CFG.mode==='picker'){ map.on('moveend',function(){ var c=map.getCenter(); post({type:'center',lat:c.lat,lng:c.lng}); }); }

  function onCmd(d){ try{ var m=typeof d==='string'?JSON.parse(d):d; if(m.type==='driver'){window.setDriver(m.lat,m.lng);} else if(m.type==='vehicleKind'){window.setVehicleKind(m.kind);} else if(m.type==='user'){window.setUser(m.lat,m.lng);} else if(m.type==='flyTo'){map.setView([m.lat,m.lng],m.zoom||map.getZoom());} else if(m.type==='route'){window.setRoute(m.coords);} }catch(e){} }
  window.addEventListener('message',function(e){onCmd(e.data);});
  document.addEventListener('message',function(e){onCmd(e.data);});
  post({type:'ready'});
</script></body></html>`;
}

export function LeafletMap({ style, center, zoom = 14, mode = 'view', markers = [], driver = null, vehicleKind = 'car', userLocation = null, flyTo = null, route = [], onCenterChange, onReady }: Props) {
  const { scheme, colors } = useTheme();
  const tileUrl = scheme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  // Build the HTML once per mode/theme/static-config (driver updates are sent live).
  const [html] = useState(() => buildHtml({ tileUrl, center, zoom, mode, markers, driver, user: userLocation, route, primary: colors.primary, vehicleKind }));

  const webRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  function handle(raw: string) {
    try {
      const m = JSON.parse(raw);
      if (m.type === 'center' && onCenterChange) onCenterChange({ lat: m.lat, lng: m.lng });
      if (m.type === 'ready' && onReady) onReady();
    } catch {}
  }

  // Send a command to the map (works on web iframe + native WebView).
  function send(msg: any, js: string) {
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), '*');
    } else {
      webRef.current?.injectJavaScript(js);
    }
  }

  // Swap the marker shape when the vehicle becomes known (after an offer is accepted).
  useEffect(() => {
    send({ type: 'vehicleKind', kind: vehicleKind },
      `window.setVehicleKind && window.setVehicleKind(${JSON.stringify(vehicleKind)}); true;`);
  }, [vehicleKind]);

  // Live driver updates → push to the map without reloading.
  useEffect(() => {
    if (!driver) return;
    send({ type: 'driver', lat: driver.lat, lng: driver.lng }, `window.setDriver && window.setDriver(${driver.lat},${driver.lng}); true;`);
  }, [driver?.lat, driver?.lng]);

  // The device's own location (blue dot).
  useEffect(() => {
    if (!userLocation) return;
    send({ type: 'user', lat: userLocation.lat, lng: userLocation.lng }, `window.setUser && window.setUser(${userLocation.lat},${userLocation.lng}); true;`);
  }, [userLocation?.lat, userLocation?.lng]);

  // Recenter the map when flyTo changes.
  useEffect(() => {
    if (!flyTo) return;
    send({ type: 'flyTo', lat: flyTo.lat, lng: flyTo.lng, zoom: 16 }, `window.flyTo && window.flyTo(${flyTo.lat},${flyTo.lng},16); true;`);
  }, [flyTo?.lat, flyTo?.lng]);

  // Route changes (e.g. driver→pickup leg switching to the journey) → redraw live.
  const routeKey = JSON.stringify(route);
  useEffect(() => {
    if (!route?.length) return;
    send({ type: 'route', coords: route }, `window.setRoute && window.setRoute(${routeKey}); true;`);
  }, [routeKey]);

  // Receive messages from the iframe on web (native uses WebView.onMessage).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMsg = (e: MessageEvent) => { if (typeof e.data === 'string') handle(e.data); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  if (Platform.OS === 'web') {
    // react-native-web uses react-dom, so a raw <iframe> renders fine.
    return React.createElement('iframe', {
      ref: (el: HTMLIFrameElement | null) => { iframeRef.current = el; },
      srcDoc: html,
      style: { border: 0, width: '100%', height: '100%', ...(style as any) },
    });
  }

  return (
    <WebView
      ref={webRef}
      originWhitelist={['*']}
      source={{ html }}
      style={[{ backgroundColor: colors.bg }, style]}
      onMessage={(e) => handle(e.nativeEvent.data)}
      javaScriptEnabled
      domStorageEnabled
    />
  );
}
