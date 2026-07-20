import { renderBrandedEmail } from '../src/lib/mailer.js';
import { writeFileSync } from 'node:fs';

const html = renderBrandedEmail({
  title: 'Réinitialisation de mot de passe',
  bodyHtml: `
    <p>Bonjour Méroë,</p>
    <p>Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte HumanUp.</p>
    <p>Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe. Ce lien est valable <strong>1 heure</strong>.</p>
  `,
  cta: {
    label: 'Réinitialiser mon mot de passe',
    href: 'https://ats.propium.co/reset-password?token=xxxxxxxxxxx',
  },
  signature: `Si vous n'avez pas demandé cette réinitialisation, ignorez cet email — votre mot de passe reste inchangé.`,
});

writeFileSync('/tmp/email-reset-preview.html', html);
console.log('written /tmp/email-reset-preview.html');
