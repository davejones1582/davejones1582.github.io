/**
 * Mobile detection utility
 */

// Detect iOS Safari
function isIOSSafari() {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) && 
           !window.MSStream && 
           (/Safari/.test(ua) || /AppleWebKit/.test(ua));
  }
  
  // Detect any mobile device
  function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
  
  export {
    isIOSSafari,
    isMobileDevice
  };