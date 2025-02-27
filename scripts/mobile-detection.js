/**
 * Mobile detection utility - fixed for desktop detection
 */

// Detect iOS Safari - improved to not trigger on desktop
function isIOSSafari() {
  const ua = navigator.userAgent;
  
  // Check if browser identifies as mobile by excluding desktop platforms
  const isDesktop = /Windows|Linux|Macintosh|Mac OS X/.test(ua) &&
                    !/iPhone|iPad|iPod/.test(ua);
  
  // If it's a desktop browser, return false even if it has Safari in the UA
  if (isDesktop) {
      return false;
  }
  
  // Otherwise, check for iOS devices
  return /iPad|iPhone|iPod/.test(ua) && 
         !window.MSStream && 
         (/Safari/.test(ua) || /AppleWebKit/.test(ua));
}

// Detect iPhone specifically (because it has more issues than iPad)
function isIPhone() {
  return /iPhone/.test(navigator.userAgent) && 
         !window.MSStream && 
         !/Windows|Linux|Macintosh|Mac OS X/.test(navigator.userAgent);
}

// Detect any mobile device
function isMobileDevice() {
  const ua = navigator.userAgent;
  
  // Check for desktop OS first
  if (/Windows NT|Linux|Macintosh|Mac OS X/.test(ua) && !/Mobi/.test(ua)) {
      return false;
  }
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobi/i.test(ua);
}

// Check if device has a small screen (regardless of device type)
function isSmallScreen() {
  return window.innerWidth < 480;
}

export {
  isIOSSafari,
  isIPhone,
  isMobileDevice,
  isSmallScreen
};