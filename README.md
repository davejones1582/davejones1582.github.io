# Reddit Video Gallery

A responsive, modern web application for browsing and viewing videos from Reddit subreddits.

## Features

- Browse videos from multiple subreddits simultaneously
- Easily toggle which subreddits to display content from
- Sort by Hot, Top, and New with time filtering
- Favorite videos to find them later
- Search functionality to filter content
- Dark/light theme support
- Works offline with service worker caching
- Responsive design for all devices
- Optimized video playback with Reddit and external platforms
- Keyboard accessibility and screen reader support

## Technical Overview

This is a vanilla JavaScript Progressive Web Application (PWA) that uses:

- ES6 modules for code organization
- Service Worker for offline support
- IndexedDB/localStorage for data persistence
- Responsive CSS with mobile-first approach
- Optimized video handling for all platforms
- Accessibility features built-in

## Performance Optimizations

- Lazy loading of images and videos
- Video memory management to minimize resource usage
- Intelligent caching strategies for API and media content
- Debounced search and infinite scrolling
- On-demand loading of content with pagination

## Installation

1. Clone this repository
2. Serve with any static file server like `python -m http.server` or `npx serve`
3. For best experience, use HTTPS to enable service worker functionality

## Development

This is a static site without build tools, so any code changes take effect immediately when refreshing the page.

## Structure

- `/scripts` - JavaScript modules
- `/styles` - CSS files
- `/icons` - PWA icons and images
- `index.html` - Main entry point
- `service-worker.js` - Offline support
- `manifest.json` - PWA configuration

## Notes

- Uses modern browser APIs - best experienced in recent versions of Chrome, Firefox, Safari
- For Reddit API access, uses an open CORS proxy to enable client-side requests
- No API key or authentication required