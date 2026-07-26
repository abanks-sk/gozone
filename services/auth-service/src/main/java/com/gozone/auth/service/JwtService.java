package com.gozone.auth.service;

import com.gozone.auth.config.JwtProperties;
import com.gozone.auth.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import org.springframework.stereotype.Service;

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
            .verifyWith(props.verificationKey())
            .requireIssuer(props.getIssuer())
            .requireAudience(props.getAudience())
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}
