export const createEmbedScript = (
  organizationId: string,
  config: { title: string; message: string },
  origin: string
) => {
  const { title, message } = config;
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
    title: "${title}",
    message: "${message}",
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
  
  iframe.src = 'http://localhost:3000/en/public/${organizationId}/widget' + 
    (queryParams ? '?' + queryParams : '');
  
  console.info('Creating iframe with src:', iframe.src);
  
  // Add error handling for iframe loading
  iframe.onerror = function() {
    console.error('Failed to load RAGENAI chatbot widget');
  };

  // Verify message origin for security
  window.addEventListener('message', function(event) {
    if (event.origin !== '${origin}') {
      console.warn('Received message from unknown origin:', event.origin);
      return;
    }
    
    console.info('Received message:', event.data);
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
})();
`;
};
