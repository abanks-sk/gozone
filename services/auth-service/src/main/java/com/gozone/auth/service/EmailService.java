package com.gozone.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Sends verification codes by email (Gmail SMTP).
 *
 * If SMTP isn't configured (blank MAIL_USERNAME) — or a send fails — the code is logged
 * instead, exactly like the OTP mock. That keeps the demo working offline and means a
 * mail outage can never block sign-up.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${app.mail.from-name:GoZone}")
    private String fromName;

    /** Dev convenience — see SmsService. MUST be false in production. */
    @Value("${app.otp.log-codes:true}")
    private boolean logCodes;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public boolean enabled() {
        return mailUsername != null && !mailUsername.isBlank();
    }

    /** Email a verification code; falls back to logging it. */
    public void sendVerificationCode(String to, String code, int expiryMinutes) {
        if (!enabled()) {
            log.info("[EMAIL-MOCK] to={} code={} expires_in={}m (SMTP not configured)", to, code, expiryMinutes);
            return;
        }
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            msg.setFrom(fromName + " <" + mailUsername + ">");
            msg.setTo(to);
            msg.setSubject("Your GoZone verification code");
            msg.setText("""
                Your GoZone verification code is: %s

                It expires in %d minutes.

                If you didn't request this, you can safely ignore this email.
                """.formatted(code, expiryMinutes));
            mailSender.send(msg);
            log.info("[EMAIL] verification code sent to {}", to);
            if (logCodes) {
                log.info("[OTP-DEV] email={} code={} (app.otp.log-codes=true — disable in production)", to, code);
            }
        } catch (Exception e) {
            // Never block the flow on a mail failure — log the code so the user can still proceed.
            log.error("[EMAIL] send to {} failed: {}", to, e.getMessage());
            log.info("[EMAIL-MOCK] to={} code={} expires_in={}m (send failed)", to, code, expiryMinutes);
        }
    }
}
