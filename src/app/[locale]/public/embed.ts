/**
 * Escape a string for safe interpolation inside a JavaScript string literal.
 * Prevents XSS by encoding characters that could break out of string context.
 */
function escapeJsString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/<\//g, '<\\/');
}

export const createEmbedScript = (
  organizationId: string,
  config: { title: string; message: string },
  origin: string,
) => {
  const safeTitle = escapeJsString(config.title);
  const safeMessage = escapeJsString(config.message);
  const safeOrgId = escapeJsString(organizationId);
  const safeOrigin = escapeJsString(origin);

  return `
(function() {
  // Prevent multiple widget instances
  if (document.getElementById('ragen-chatbot')) {
    console.warn('RAGENAI chatbot widget already exists');
    return;
  }

  console.info('RAGENAI chatbot widget script loaded');

  // Construct query parameters
  const queryParams = new URLSearchParams({
    title: "${safeTitle}",
    message: "${safeMessage}",
  }).toString();

  const iframe = document.createElement('iframe');
  iframe.id = 'ragen-chatbot';
  iframe.style.position = 'fixed';
  iframe.style.bottom = '20px';
  iframe.style.right = '20px';
  iframe.style.width = '80px';
  iframe.style.height = '80px';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '50%';
  iframe.style.transition = 'all 0.3s ease';
  iframe.style.zIndex = '999999';
  iframe.style.overflow = 'hidden';
  iframe.style.scrolling = 'no';
  iframe.setAttribute('scrolling', 'no');
  iframe.style.backgroundColor = 'transparent';
  iframe.style.opacity = '0';
  iframe.style.boxShadow = 'var(--widget-shadow)';
  iframe.style.border = 'var(--widget-border)';

  iframe.src = "${safeOrigin}/public/${safeOrgId}/widget" +
    (queryParams ? '?' + queryParams : '');

  console.info('Creating iframe with src:', iframe.src);

  // Add error handling for iframe loading
  iframe.onerror = function() {
    console.error('Failed to load RAGENAI chatbot widget');
  };

  // Verify message origin for security
  window.addEventListener('message', function(event) {
    if (event.origin !== '${safeOrigin}') {
      console.warn('Received message from unknown origin:', event.origin);
      return;
    }

    if (event.data.type === 'loaded') {
      iframe.style.opacity = '1';
    }
    else if (event.data.type === 'resize') {
      iframe.style.width = event.data.width + 'px';
      iframe.style.height = event.data.height + 'px';
      iframe.style.borderRadius = event.data.width === 80 ? '50%' : '16px';
    }
  });

  document.body.appendChild(iframe);
  console.info('Iframe appended to body');

  // Add this CSS variable definition before the iframe creation
  const colorSchemeStyles = \`
    :root {
      --widget-border: 1px solid rgba(0,0,0,0.1);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --widget-shadow: 0 2px 12px rgba(0,0,0,0.4);
      }
    }
  \`;
  const styleSheet = document.createElement('style');
  styleSheet.textContent = colorSchemeStyles;
  document.head.appendChild(styleSheet);
})();
`;
};
