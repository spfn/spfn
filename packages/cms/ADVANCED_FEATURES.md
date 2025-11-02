# Advanced Features

This guide covers advanced features of @spfn/cms that extend beyond basic text label management.

## Table of Contents

- [Label Value Types](#label-value-types)
- [Breakpoint Support (Responsive)](#breakpoint-support-responsive)
- [InitCms Component](#initcms-component)
- [Draft Mode & Live Editing](#draft-mode--live-editing)
- [Advanced Client Store](#advanced-client-store)
- [Nested Label Structure](#nested-label-structure)

---

## Label Value Types

@spfn/cms supports 5 different value types beyond simple text strings.

### 1. TextValue

Simple text content (default type).

```json
{
  "title": {
    "key": "home.hero.title",
    "type": "text",
    "defaultValue": "Welcome"
  }
}
```

### 2. ImageValue

Image with metadata.

```json
{
  "heroImage": {
    "key": "home.hero.image",
    "type": "image",
    "defaultValue": {
      "type": "image",
      "url": "/uploads/hero.jpg",
      "alt": "Hero Image",
      "width": 1920,
      "height": 1080
    }
  }
}
```

**Fields:**
- `url` (required) - Image URL
- `alt` (optional) - Alt text for accessibility
- `width` (optional) - Image width in pixels
- `height` (optional) - Image height in pixels

**Usage:**
```typescript
const { t } = await getSection('home');
const image = t('hero.image');
// { type: 'image', url: '/uploads/hero.jpg', alt: 'Hero Image', width: 1920, height: 1080 }

// In JSX
<img src={image.url} alt={image.alt} width={image.width} height={image.height} />
```

### 3. VideoValue

Video with metadata.

```json
{
  "introVideo": {
    "key": "home.intro.video",
    "type": "video",
    "defaultValue": {
      "type": "video",
      "url": "/uploads/intro.mp4",
      "thumbnail": "/uploads/intro-thumb.jpg",
      "duration": 120
    }
  }
}
```

**Fields:**
- `url` (required) - Video URL
- `thumbnail` (optional) - Thumbnail image URL
- `duration` (optional) - Duration in seconds

**Usage:**
```typescript
const { t } = await getSection('home');
const video = t('intro.video');

<video src={video.url} poster={video.thumbnail}>
  <source src={video.url} type="video/mp4" />
</video>
```

### 4. FileValue

File download with metadata.

```json
{
  "brochure": {
    "key": "resources.brochure",
    "type": "file",
    "defaultValue": {
      "type": "file",
      "url": "/downloads/brochure.pdf",
      "filename": "company-brochure.pdf",
      "size": 2048576
    }
  }
}
```

**Fields:**
- `url` (required) - File URL
- `filename` (required) - Original filename
- `size` (optional) - File size in bytes

**Usage:**
```typescript
const { t } = await getSection('resources');
const file = t('brochure');

<a href={file.url} download={file.filename}>
  Download ({(file.size / 1024 / 1024).toFixed(2)} MB)
</a>
```

### 5. ObjectValue (Recursive)

Complex nested structure with multiple fields.

```json
{
  "feature1": {
    "key": "home.features.feature1",
    "type": "object",
    "defaultValue": {
      "type": "object",
      "fields": {
        "title": { "type": "text", "content": "Fast Performance" },
        "icon": { "type": "image", "url": "/icons/speed.svg", "alt": "Speed Icon" },
        "description": { "type": "text", "content": "Lightning-fast page loads" },
        "link": { "type": "text", "content": "/features/performance" }
      }
    }
  }
}
```

**Usage:**
```typescript
const { t } = await getSection('home');
const feature = t('features.feature1');

<div className="feature-card">
  <img src={feature.fields.icon.url} alt={feature.fields.icon.alt} />
  <h3>{feature.fields.title.content}</h3>
  <p>{feature.fields.description.content}</p>
  <a href={feature.fields.link.content}>Learn More</a>
</div>
```

---

## Breakpoint Support (Responsive)

Provide different content for different screen sizes.

### Supported Breakpoints

- `null` - Default (all screen sizes)
- `sm` - Small (≥640px, mobile)
- `md` - Medium (≥768px, tablet)
- `lg` - Large (≥1024px, desktop)
- `xl` - Extra Large (≥1280px)
- `2xl` - 2X Extra Large (≥1536px)

### Example: Responsive Images

```json
{
  "heroImage": {
    "key": "home.hero.image",
    "type": "image",
    "defaultValue": {
      "type": "image",
      "url": "/uploads/hero-desktop.jpg",
      "alt": "Hero Image",
      "width": 1920,
      "height": 1080
    }
  }
}
```

**Mobile version (stored separately in DB):**
```typescript
// This would be managed via CMS UI or API
await db.insert(cmsLabelValues).values({
  labelId: 1,
  version: 1,
  locale: 'ko',
  breakpoint: 'sm',  // Mobile breakpoint
  value: {
    type: 'image',
    url: '/uploads/hero-mobile.jpg',
    alt: 'Hero Image',
    width: 640,
    height: 480
  }
});
```

### How It Works

1. System queries for label with current breakpoint
2. Falls back to larger breakpoint if not found
3. Finally falls back to default (null breakpoint)

**Query priority:**
```
sm → md → lg → xl → 2xl → null (default)
```

---

## InitCms Component

The `InitCms` component bridges server-rendered data to client-side store.

### Problem It Solves

Server Components can fetch data, but Client Components need access to that data without making additional API calls.

### Basic Usage

```typescript
// app/layout.tsx (Server Component)
import { getSection } from '@spfn/cms/server';
import { InitCms } from '@spfn/cms/client';

export default async function RootLayout({ children }) {
  const home = await getSection('home');
  const layout = await getSection('layout');

  return (
    <html>
      <body>
        <InitCms sections={{ home, layout }} />
        {children}
      </body>
    </html>
  );
}
```

```typescript
// components/ClientNav.tsx (Client Component)
'use client';
import { useSection } from '@spfn/cms/client';

export function ClientNav() {
  // Data is already in store, no API call needed
  const { t, loading } = useSection('layout');

  if (loading) return null;

  return (
    <nav>
      <a href="/about">{t('nav.about')}</a>
      <a href="/services">{t('nav.services')}</a>
    </nav>
  );
}
```

### Multiple Sections

```typescript
// Preload multiple sections
const sections = await getSections(['home', 'layout', 'footer']);

<InitCms sections={sections} />
```

### How It Works

1. Server Component fetches data via `getSection()` or `getSections()`
2. `InitCms` receives the data as props
3. On mount, it populates the Zustand store
4. Child Client Components access the store via `useSection()`

---

## Draft Mode & Live Editing

Enable real-time content editing in your CMS UI.

### updateLabel Function

Modify label values in the client-side store without saving to server.

```typescript
'use client';
import { useCmsStore } from '@spfn/cms/client';

export function DraftEditor() {
  const updateLabel = useCmsStore(state => state.updateLabel);
  const { t } = useSection('home');

  const [draftValue, setDraftValue] = useState(t('hero.title'));

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setDraftValue(newValue);

    // Update store (visible immediately in preview)
    updateLabel('home', 'hero.title', newValue);
  };

  return (
    <div>
      <input value={draftValue} onChange={handleChange} />
      <Preview />
    </div>
  );
}

function Preview() {
  const { t } = useSection('home');
  return <h1>{t('hero.title')}</h1>; // Shows updated value
}
```

### Save Draft to Server

```typescript
import { cmsDraftCacheRepository } from '@spfn/cms/server';

async function saveDraft(userId: string, section: string, locale: string, content: Record<string, any>) {
  await cmsDraftCacheRepository.upsert({
    section,
    locale,
    userId,
    content
  });
}
```

### Load Draft from Server

```typescript
async function loadDraft(userId: string, section: string, locale: string) {
  const draft = await cmsDraftCacheRepository.findByUser(section, locale, userId);
  return draft?.content;
}
```

---

## Advanced Client Store

The `useCmsStore` provides low-level store access.

### Store State

```typescript
interface CmsState {
  sections: Record<string, SectionData>;  // All loaded sections
  loading: Record<string, boolean>;        // Loading states
  setSection: (section: string, data: SectionData) => void;
  setSections: (sections: Record<string, SectionData>) => void;
  loadSection: (section: string, locale?: string) => Promise<void>;
  updateLabel: (section: string, key: string, value: any) => void;
  reset: () => void;
}
```

### Manual Section Loading

```typescript
import { useCmsStore } from '@spfn/cms/client';

export function LazySection() {
  const loadSection = useCmsStore(state => state.loadSection);
  const sections = useCmsStore(state => state.sections);

  const handleLoad = async () => {
    await loadSection('features', 'en');
  };

  return (
    <button onClick={handleLoad}>
      Load Features
    </button>
  );
}
```

### Reset Store

```typescript
const reset = useCmsStore(state => state.reset);

function Logout() {
  const handleLogout = () => {
    reset(); // Clear all CMS data
    // ... logout logic
  };

  return <button onClick={handleLogout}>Logout</button>;
}
```

### Access Raw Store Data

```typescript
const sections = useCmsStore(state => state.sections);
const homeSection = sections['home'];

console.log(homeSection.content);     // All labels as object
console.log(homeSection.version);     // Current version
console.log(homeSection.publishedAt); // Publish timestamp
```

---

## Nested Label Structure

Organize labels hierarchically for better maintainability.

### Flat Structure (Basic)

```json
{
  "home": {
    "key": "nav.home",
    "defaultValue": "Home"
  },
  "about": {
    "key": "nav.about",
    "defaultValue": "About"
  }
}
```

### Nested Structure (Recommended)

```json
{
  "nav": {
    "home": {
      "key": "layout.nav.home",
      "defaultValue": "Home"
    },
    "about": {
      "key": "layout.nav.about",
      "defaultValue": "About"
    }
  },
  "footer": {
    "copyright": {
      "key": "layout.footer.copyright",
      "defaultValue": "© {year} Company"
    },
    "social": {
      "facebook": {
        "key": "layout.footer.social.facebook",
        "defaultValue": "https://facebook.com/company"
      },
      "twitter": {
        "key": "layout.footer.social.twitter",
        "defaultValue": "https://twitter.com/company"
      }
    }
  }
}
```

### Benefits

- **Better organization** - Group related labels together
- **Easier maintenance** - Clear hierarchy in JSON files
- **Same usage** - No difference when using `t()` function

```typescript
// Both structures work the same way
const { t } = await getSection('layout');
t('nav.home');               // "Home"
t('footer.social.facebook'); // "https://facebook.com/company"
```

### Helper Functions

```typescript
import { flattenLabels } from '@spfn/cms/server';

const nested = {
  nav: {
    home: { key: 'layout.nav.home', defaultValue: 'Home' }
  }
};

const flat = flattenLabels(nested);
// [{ key: 'layout.nav.home', defaultValue: 'Home' }]
```

---

## Next Steps

- **[Locale Management](./LOCALE_GUIDE.md)** - Complete locale guide with 50+ languages
- **[API Reference](./API_REFERENCE.md)** - Complete API documentation
- **[Draft & Versioning](./DRAFT_AND_VERSIONING.md)** - Draft system and version control