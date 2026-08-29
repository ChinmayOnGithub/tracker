export default function ThemeScript() {
  const bootstrapScript = `
    (function() {
      try {
        var theme = localStorage.getItem('theme') || 'dark';
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }

        var accent = localStorage.getItem('personal_accent_color') || 'blue';
        var fontSize = localStorage.getItem('personal_font_size') || 'md';
        var rounded = localStorage.getItem('personal_rounded_corners') || 'md';
        var animations = localStorage.getItem('personal_animations') || 'on';

        var colors = {
          purple: { primary: '#a855f7', hover: '#9333ea' },
          green: { primary: '#22c55e', hover: '#16a34a' },
          blue: { primary: '#007aff', hover: '#0056b3' },
          orange: { primary: '#f97316', hover: '#ea580c' },
          indigo: { primary: '#818cf8', hover: '#6366f1' }
        };

        var match = colors[accent] || colors.blue;
        var fontSizes = { sm: '13px', md: '14px', lg: '16px' };
        var radiusConfig = {
          none: { xs: '0px', sm: '0px', md: '0px', lg: '0px', xl: '0px', '2xl': '0px', '3xl': '0px' },
          md: { xs: '2px', sm: '2px', md: '4px', lg: '6px', xl: '8px', '2xl': '12px', '3xl': '16px' },
          full: { xs: '4px', sm: '6px', md: '12px', lg: '20px', xl: '24px', '2xl': '32px', '3xl': '40px' }
        };
        var activeRadius = radiusConfig[rounded] || radiusConfig.md;

        var css = ':root {' +
          '--color-primary: ' + match.primary + ' !important;' +
          '--color-primary-hover: ' + match.hover + ' !important;' +
          '--radius-xs: ' + activeRadius.xs + ' !important;' +
          '--radius-sm: ' + activeRadius.sm + ' !important;' +
          '--radius-md: ' + activeRadius.md + ' !important;' +
          '--radius-lg: ' + activeRadius.lg + ' !important;' +
          '--radius-xl: ' + activeRadius.xl + ' !important;' +
          '--radius-2xl: ' + activeRadius['2xl'] + ' !important;' +
          '--radius-3xl: ' + activeRadius['3xl'] + ' !important;' +
          '--card-radius: ' + activeRadius.lg + ' !important;' +
          'font-size: ' + (fontSizes[fontSize] || fontSizes.md) + ' !important;' +
          '} ' +
          '.dark {' +
          '--color-primary: ' + match.primary + ' !important;' +
          '--color-primary-hover: ' + match.hover + ' !important;' +
          '}';

        if (animations === 'off') {
          css += ' *, *::before, *::after {' +
            'animation-duration: 0s !important;' +
            'animation-delay: 0s !important;' +
            'transition-duration: 0s !important;' +
            '}';
        }

        var styleEl = document.getElementById('custom-personal-styles');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'custom-personal-styles';
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
      } catch (e) {
        console.warn('Early theme bootstrap failed:', e);
      }
    })();
  `;

  return (
    <script
      id="theme-script"
      dangerouslySetInnerHTML={{ __html: bootstrapScript }}
    />
  );
}
