# Icons

This directory manages SVG icons for the project.

## Usage

Import SVG files as React components using SVGR:

```tsx
import Logo from '@/assets/icons/logo.svg';

function MyComponent() {
  return (
    <Logo className="size-8 text-gray-900 dark:text-white" />
  );
}
```

## Color Control

Use `fill="currentColor"` in your SVG files to control colors via Tailwind CSS:

```tsx
// Light mode: gray-900, Dark mode: white
<Logo className="size-8 text-gray-900 dark:text-white" />

// Custom colors
<Icon className="size-6 text-blue-600" />
```

## Adding New Icons

1. Add SVG file to this directory
2. Set `fill="currentColor"` for color control (optional)
3. Remove `width` and `height` attributes for flexible sizing
4. Import and use as React component

```tsx
import NewIcon from '@/assets/icons/new-icon.svg';
```

## Configuration

- **next.config.ts**: SVGR webpack loader configuration
- **Turbopack**: SVG loader rules for fast refresh

## Example SVG Structure

```xml
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="..." fill="currentColor"/>
</svg>
```

Note: Remove `width` and `height` for flexible sizing with Tailwind utilities.
