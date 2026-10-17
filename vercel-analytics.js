// Initialize Vercel Web Analytics without an inline script so the site's CSP
// can continue to block inline JavaScript.
window.va = window.va || function () {
  (window.vaq = window.vaq || []).push(arguments);
};

const analyticsScript = document.createElement("script");
analyticsScript.defer = true;
analyticsScript.src = "/_vercel/insights/script.js";
document.head.appendChild(analyticsScript);
