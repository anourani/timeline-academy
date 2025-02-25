export function lockScroll() {
  // Save current scroll position
  const scrollY = window.scrollY;
  
  // Add styles to prevent scrolling while maintaining position
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
  
  // Add padding to prevent content shift
  document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`;
}

export function unlockScroll() {
  // Get the scroll position from the body's top property
  const scrollY = document.body.style.top;
  
  // Remove the fixed positioning
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.paddingRight = '';
  
  // Restore scroll position
  window.scrollTo(0, parseInt(scrollY || '0') * -1);
}