/**
 * Auto-generated OAuth callback HTML templates
 * Generated from templates/*.html and templates/*.css
 *
 * To regenerate: bun run templates/build.ts
 */

export const successTemplate = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Authorization Successful</title><style>:root{--system-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;--mono-font:ui-monospace,SFMono-Regular,"SF Mono",Consolas,"Liberation Mono",Menlo,monospace}@media (prefers-color-scheme:dark){:root{color-scheme:dark}}.minimal-body{margin:0;padding:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:var(--system-font);background:linear-gradient(180deg,#fafafa 0%,#f0f0f0 100%);color:#1a1a1a;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.dark .minimal-body{background:linear-gradient(180deg,#0a0a0a 0%,#1a1a1a 100%);color:#fafafa}.minimal-card{background:white;border-radius:16px;padding:48px 40px 40px;max-width:420px;width:90%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 6px 16px rgba(0,0,0,0.08);animation:fadeUp 0.4s ease-out}.dark .minimal-card{background:#1f1f1f;box-shadow:0 1px 3px rgba(0,0,0,0.2),0 8px 24px rgba(0,0,0,0.4)}.minimal-title{font-size:24px;font-weight:600;margin:0 0 8px;letter-spacing:-0.02em;line-height:1.2}.minimal-subtitle{font-size:15px;color:#666;margin:0 0 32px;line-height:1.5}.dark .minimal-subtitle{color:#999}.success-icon-container{width:56px;height:56px;margin:0 auto 24px}.checkmark{width:56px;height:56px}.checkmark-circle{stroke:#10b981;stroke-width:2;stroke-miterlimit:10;stroke-dasharray:157;stroke-dashoffset:157;fill:none}.checkmark-check{stroke:#10b981;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:10;stroke-dasharray:48;stroke-dashoffset:48;fill:none}.checkmark.animate .checkmark-circle{animation:stroke 0.6s cubic-bezier(0.65,0,0.45,1) forwards}.checkmark.animate .checkmark-check{animation:stroke 0.3s cubic-bezier(0.65,0,0.45,1) 0.4s forwards}@keyframes stroke{100%{stroke-dashoffset:0}}.error-icon-container{width:56px;height:56px;margin:0 auto 24px;color:#ef4444}.error-icon-container.animate svg{animation:errorPulse 0.5s ease-out,shake 0.4s ease-out 0.3s}.error-icon-container.animate svg circle{stroke-dasharray:63;stroke-dashoffset:63;animation:errorStroke 0.5s cubic-bezier(0.65,0,0.45,1) forwards}.error-icon-container.animate svg path{stroke-dasharray:20;stroke-dashoffset:20;animation:errorStroke 0.4s cubic-bezier(0.65,0,0.45,1) 0.3s forwards}@keyframes errorPulse{0%{transform:scale(0);opacity:0}50%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}@keyframes errorStroke{to{stroke-dashoffset:0}}@keyframes shake{0%,100%{transform:translateX(0) scale(1)}25%{transform:translateX(-4px) scale(1)}75%{transform:translateX(4px) scale(1)}}.countdown-container{margin-top:32px;padding-top:24px;border-top:1px solid #e5e5e5}.dark .countdown-container{border-top-color:#333}.countdown-label{font-size:13px;color:#666;margin-bottom:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em}.dark .countdown-label{color:#999}#countdown-text{font-family:var(--mono-font);font-weight:600;color:#1a1a1a}.dark #countdown-text{color:#fafafa}.progress-track{width:100%;height:3px;background:#e5e5e5;border-radius:3px;overflow:hidden}.dark .progress-track{background:#333}.progress-bar{height:100%;background:linear-gradient(90deg,#10b981 0%,#059669 100%);border-radius:3px;transition:width 100ms linear;width:0}.minimal-actions{display:flex;gap:12px;margin-top:24px;padding-top:24px;border-top:1px solid #e5e5e5}.dark .minimal-actions{border-top-color:#333}.minimal-button{flex:1;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;border:none;cursor:pointer;transition:all 0.2s ease;font-family:var(--system-font);letter-spacing:-0.01em}.minimal-button:active{transform:scale(0.98)}.minimal-button.primary{background:#1a1a1a;color:white}.minimal-button.primary:hover{background:#000}.dark .minimal-button.primary{background:#fafafa;color:#1a1a1a}.dark .minimal-button.primary:hover{background:#fff}.minimal-button.secondary{background:#f5f5f5;color:#666}.minimal-button.secondary:hover{background:#e8e8e8}.dark .minimal-button.secondary{background:#2a2a2a;color:#999}.dark .minimal-button.secondary:hover{background:#333}.minimal-help{font-size:12px;color:#999;margin-top:16px;line-height:1.5}.dark .minimal-help{color:#666}.minimal-error-details{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:20px 0;text-align:left;font-size:13px;line-height:1.6}.dark .minimal-error-details{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3)}.minimal-error-details strong{color:#dc2626;display:block;margin-bottom:4px;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}.dark .minimal-error-details strong{color:#ef4444}.minimal-error-details code{font-family:var(--mono-font);background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;font-size:12px}.dark .minimal-error-details code{background:rgba(255,255,255,0.1)}@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion:reduce){*{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important}}.minimal-button:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}@media (prefers-contrast:high){.minimal-card{border:2px solid currentColor}.minimal-button{border:1px solid currentColor}}</style> <script>      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {         document.documentElement.classList.add("dark");       }       window.addEventListener("DOMContentLoaded", () => {         const checkmark = document.getElementById("checkmark");         if (checkmark) {           setTimeout(() => checkmark.classList.add("animate"), 100);         }       });</script> </head><body class="minimal-body"><div class="minimal-card"><div class="success-icon-container"><svg id="checkmark" class="checkmark" viewBox="0 0 52 52"><circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none" /><path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" /></svg></div><h1 class="minimal-title">Authorization Successful</h1><p class="minimal-subtitle">You can now return to your application</p></div></body></html>`;

export const errorTemplate = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>{{ERROR_TITLE}}</title><style>:root{--system-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Helvetica Neue",sans-serif;--mono-font:ui-monospace,SFMono-Regular,"SF Mono",Consolas,"Liberation Mono",Menlo,monospace}@media (prefers-color-scheme:dark){:root{color-scheme:dark}}.minimal-body{margin:0;padding:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:var(--system-font);background:linear-gradient(180deg,#fafafa 0%,#f0f0f0 100%);color:#1a1a1a;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.dark .minimal-body{background:linear-gradient(180deg,#0a0a0a 0%,#1a1a1a 100%);color:#fafafa}.minimal-card{background:white;border-radius:16px;padding:48px 40px 40px;max-width:420px;width:90%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 6px 16px rgba(0,0,0,0.08);animation:fadeUp 0.4s ease-out}.dark .minimal-card{background:#1f1f1f;box-shadow:0 1px 3px rgba(0,0,0,0.2),0 8px 24px rgba(0,0,0,0.4)}.minimal-title{font-size:24px;font-weight:600;margin:0 0 8px;letter-spacing:-0.02em;line-height:1.2}.minimal-subtitle{font-size:15px;color:#666;margin:0 0 32px;line-height:1.5}.dark .minimal-subtitle{color:#999}.success-icon-container{width:56px;height:56px;margin:0 auto 24px}.checkmark{width:56px;height:56px}.checkmark-circle{stroke:#10b981;stroke-width:2;stroke-miterlimit:10;stroke-dasharray:157;stroke-dashoffset:157;fill:none}.checkmark-check{stroke:#10b981;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:10;stroke-dasharray:48;stroke-dashoffset:48;fill:none}.checkmark.animate .checkmark-circle{animation:stroke 0.6s cubic-bezier(0.65,0,0.45,1) forwards}.checkmark.animate .checkmark-check{animation:stroke 0.3s cubic-bezier(0.65,0,0.45,1) 0.4s forwards}@keyframes stroke{100%{stroke-dashoffset:0}}.error-icon-container{width:56px;height:56px;margin:0 auto 24px;color:#ef4444}.error-icon-container.animate svg{animation:errorPulse 0.5s ease-out,shake 0.4s ease-out 0.3s}.error-icon-container.animate svg circle{stroke-dasharray:63;stroke-dashoffset:63;animation:errorStroke 0.5s cubic-bezier(0.65,0,0.45,1) forwards}.error-icon-container.animate svg path{stroke-dasharray:20;stroke-dashoffset:20;animation:errorStroke 0.4s cubic-bezier(0.65,0,0.45,1) 0.3s forwards}@keyframes errorPulse{0%{transform:scale(0);opacity:0}50%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}@keyframes errorStroke{to{stroke-dashoffset:0}}@keyframes shake{0%,100%{transform:translateX(0) scale(1)}25%{transform:translateX(-4px) scale(1)}75%{transform:translateX(4px) scale(1)}}.countdown-container{margin-top:32px;padding-top:24px;border-top:1px solid #e5e5e5}.dark .countdown-container{border-top-color:#333}.countdown-label{font-size:13px;color:#666;margin-bottom:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.05em}.dark .countdown-label{color:#999}#countdown-text{font-family:var(--mono-font);font-weight:600;color:#1a1a1a}.dark #countdown-text{color:#fafafa}.progress-track{width:100%;height:3px;background:#e5e5e5;border-radius:3px;overflow:hidden}.dark .progress-track{background:#333}.progress-bar{height:100%;background:linear-gradient(90deg,#10b981 0%,#059669 100%);border-radius:3px;transition:width 100ms linear;width:0}.minimal-actions{display:flex;gap:12px;margin-top:24px;padding-top:24px;border-top:1px solid #e5e5e5}.dark .minimal-actions{border-top-color:#333}.minimal-button{flex:1;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;border:none;cursor:pointer;transition:all 0.2s ease;font-family:var(--system-font);letter-spacing:-0.01em}.minimal-button:active{transform:scale(0.98)}.minimal-button.primary{background:#1a1a1a;color:white}.minimal-button.primary:hover{background:#000}.dark .minimal-button.primary{background:#fafafa;color:#1a1a1a}.dark .minimal-button.primary:hover{background:#fff}.minimal-button.secondary{background:#f5f5f5;color:#666}.minimal-button.secondary:hover{background:#e8e8e8}.dark .minimal-button.secondary{background:#2a2a2a;color:#999}.dark .minimal-button.secondary:hover{background:#333}.minimal-help{font-size:12px;color:#999;margin-top:16px;line-height:1.5}.dark .minimal-help{color:#666}.minimal-error-details{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:20px 0;text-align:left;font-size:13px;line-height:1.6}.dark .minimal-error-details{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3)}.minimal-error-details strong{color:#dc2626;display:block;margin-bottom:4px;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}.dark .minimal-error-details strong{color:#ef4444}.minimal-error-details code{font-family:var(--mono-font);background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px;font-size:12px}.dark .minimal-error-details code{background:rgba(255,255,255,0.1)}@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion:reduce){*{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important}}.minimal-button:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}@media (prefers-contrast:high){.minimal-card{border:2px solid currentColor}.minimal-button{border:1px solid currentColor}}</style> <script>      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {         document.documentElement.classList.add("dark");       }       window.addEventListener("DOMContentLoaded", () => {         const errorIcon = document.getElementById("error-icon");         if (errorIcon) {           setTimeout(() => errorIcon.classList.add("animate"), 100);         }       });       document.addEventListener("keydown", (e) => {         if (e.key === "Escape") {           window.close();         } else if (e.key === "Enter") {           window.location.reload();         }       });</script> </head><body class="minimal-body"><div class="minimal-card"><div class="error-icon-container" id="error-icon">{{ERROR_SVG_ICON}}</div><h1 class="minimal-title">{{ERROR_TITLE}}</h1><p class="minimal-subtitle">{{ERROR_MESSAGE}}</p> {{ERROR_DETAILS}} <div class="minimal-actions"><button onclick="window.location.reload()" class="minimal-button primary" > Try Again </button><button onclick="window.close()" class="minimal-button secondary"> Close </button></div><p class="minimal-help">{{HELP_TEXT}}</p></div></body></html>`;

// Params must already be HTML-escaped; see generateCallbackHTML in server.ts.
export function renderError(params: {
  error: string;
  error_description?: string;
  error_uri?: string;
}): string {
  // Determine error title and message based on error type
  let errorTitle = "Authorization Failed";
  let errorMessage = "The authorization process could not be completed.";
  let helpText = "If the problem persists, please contact support.";
  let errorSvgIcon = "";

  switch (params.error) {
    case "access_denied":
      errorTitle = "Access Denied";
      errorMessage = "You have denied access to the application.";
      helpText = 'Click "Try Again" to restart the authorization process.';
      errorSvgIcon = `
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Access denied icon">
          <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      break;
    case "invalid_request":
      errorTitle = "Invalid Request";
      errorMessage =
        "The authorization request was malformed or missing required parameters.";
      errorSvgIcon = `
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Invalid request icon">
          <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      break;
    case "unauthorized_client":
      errorTitle = "Unauthorized Client";
      errorMessage =
        "This application is not authorized to use this authentication method.";
      errorSvgIcon = `
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Unauthorized icon">
          <path d="M12 11V7a3 3 0 00-6 0v4m-1 0h8a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      break;
    case "server_error":
      errorTitle = "Server Error";
      errorMessage =
        "The authorization server encountered an unexpected error.";
      helpText = "Please wait a moment and try again.";
      errorSvgIcon = `
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Server error icon">
          <path d="M12 9v6m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      break;
    default:
      errorSvgIcon = `
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Warning icon">
          <path d="M12 9v4m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
  }

  let errorDetails = "";
  if (params.error_description || params.error) {
    errorDetails = `
      <div class="minimal-error-details">
        <strong>Error Code</strong>
        <code>${params.error}</code>
        ${params.error_description ? `<p>${params.error_description}</p>` : ""}
        ${params.error_uri ? `<p><a href="${params.error_uri}" target="_blank">More information →</a></p>` : ""}
      </div>`;
  }

  // Untrusted details go in last so a "{{...}}" inside them is never expanded;
  // the function replacer also keeps "$&"-style sequences literal.
  return errorTemplate
    .replace(/{{ERROR_TITLE}}/g, errorTitle)
    .replace("{{ERROR_ICON}}", "⚠️") // Fallback for old template
    .replace("{{ERROR_SVG_ICON}}", errorSvgIcon)
    .replace("{{ERROR_MESSAGE}}", errorMessage)
    .replace("{{HELP_TEXT}}", helpText)
    .replace("{{ERROR_DETAILS}}", () => errorDetails);
}
