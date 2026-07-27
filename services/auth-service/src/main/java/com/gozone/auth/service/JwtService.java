package com.gozone.auth.service;

import com.gozone.auth.config.JwtProperties;
import com.gozone.auth.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import org.springframework.stereotype.Service;

import java.security.Key;
import java.util.Date;

/**
 * Mints and reads access tokens.
 *
 * <p>Signed with <b>RS256</b>: auth-service holds the private key and is the only thing on the
 * platform that can produce a valid token. The other services hold only the public key, so they
 * can check a token but never forge one — a compromise of ride, food, wallet or the gateway no
 * longer hands over the ability to mint an admin session.
 */
@Service
public class JwtService {

    private final JwtProperties props;

    public JwtService(JwtProperties props) {
        this.props = props;
    }

    public String generateAccessToken(User user) {
        return Jwts.builder()
            // Names the key that signed this token, so a verifier holding several published keys
            // knows which to check it with — the thing that lets us rotate without a flag day.
            .header().keyId(props.signingKeyId()).and()
            .subject(user.getId().toString())
            .issuer(props.getIssuer())
            .audience().add(props.getAudience()).and()
            .claim("role", user.getRole().name())
            .claim("status", user.getStatus().name())
            .claim("phone", user.getPhone())
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + props.getExpiryMs()))
            .signWith(props.signingKey(), Jwts.SIG.RS256)
            .compact();
    }

    public Claims validateAndParseClaims(String token) {
        return Jwts.parser()
            // Resolve by kid so tokens signed with a key we have since retired still verify
            // until they expire (see JwtProperties.previousPublicKeys).
            .keyLocator(header -> {
                Object kid = header.get("kid");
                Key key = kid == null ? null : props.verificationKeys().get(kid.toString());
                return key != null ? key : props.verificationKey();
            })
            .requireIssuer(props.getIssuer())
            .requireAudience(props.getAudience())
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}
