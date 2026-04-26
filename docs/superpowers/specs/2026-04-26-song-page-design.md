# Song Detail Page (`/song/:songId`)

## Overview

A dedicated song page at `/song/:songId` that shows all charts for a song, organized by two-tier tabs (type → difficulty, both descending). All tab panels render in the DOM for SEO. Uses `unhead` for `<head>` management. The sheet content component is a new standalone copy, not reusing `SheetDialogContent`.

## URL Structure

- **Route**: `/song/:songId` (e.g., `/song/pandoraparadoxxx`)
- `songId` matches `Song.songId` from dxdata
- No type or difficulty in the URL — tab state is client-side only

## Page Layout

```
┌────────────────────────────────────┐
│ Song Header (shared across tabs)   │
│  ┌──────┐  Title                   │
│  │Cover │  Artist · Category       │
│  │ Art  │  Release date            │
│  └──────┘  Tags, External links    │
├────────────────────────────────────┤
│ Type Tabs:  DX | STD | UTAGE       │
├────────────────────────────────────┤
│ Difficulty Tabs: Re:M | Ma | Ex... │
├────────────────────────────────────┤
│ Sheet Content Panel                │
│  - Internal level value            │
│  - Internal level history          │
│  - Details table (designer, BPM,   │
│    notes, regions, lock status)    │
│  - Comments                        │
│  - Achievement-to-rating table     │
└────────────────────────────────────┘
```

## Tab Behavior

### Type Tabs (Layer 1)
- Order: DX → STD → UTAGE (descending by modernity)
- Only show types that exist for this song
- Default: first available type (typically DX)

### Difficulty Tabs (Layer 2)
- Order: Re:MASTER → MASTER → EXPERT → ADVANCED → BASIC (descending)
- Only show difficulties that exist for the selected type
- Default: highest difficulty available for the selected type
- When switching type tabs, auto-select the highest difficulty of the new type

### SEO Rendering
- All tab panels (every type × difficulty combination) render in the DOM
- Non-active panels are hidden via CSS (`display: none` or `visibility: hidden` with `height: 0; overflow: hidden`)
- This ensures crawlers index all chart data for the song

## Head Management (`unhead`)

Install `unhead` (the framework-agnostic core). Create a `useHead()` wrapper or use `unhead`'s DOM patching API directly since there is no official `@unhead/react` package — a thin wrapper around `createHead()` and `useHead()` is sufficient.

Meta tags are song-level only (do not change when switching tabs):
- `<title>`: `{songTitle} - DXRating`
- `og:title`: `{songTitle} - DXRating`
- `og:description`: `{artist} · {category}`
- `og:image`: `https://shama.dxrating.net/images/cover/v2/{imageName}.jpg`
- `og:url`: `https://dxrating.net/song/{songId}`
- Standard meta: `description`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`

## New Components

### `SongPage` (`apps/web/src/pages/SongPage.tsx`)
- Route handler for `/song/:songId`
- Looks up song by `songId` from `dxdata.songs`
- Shows 404 if not found
- Renders `SongHeader` + `SongSheetTabs` + `SongSheetContent` for every sheet
- Manages `unhead` meta tags

### `SongHeader` (`apps/web/src/components/song/SongHeader.tsx`)
- Song cover image (larger than dialog version — expandable)
- Song title with click-to-copy
- Artist, category
- Release date with relative time
- Tags
- Alt names
- External search links (YouTube, Bilibili, Spotify)
- Favorite toggle

### `SongSheetTabs` (`apps/web/src/components/song/SongSheetTabs.tsx`)
- Two-tier tab component
- Manages active type + active difficulty state
- Renders type tabs and difficulty tabs with proper colors from `DIFFICULTIES`

### `SongSheetContent` (`apps/web/src/components/song/SongSheetContent.tsx`)
- Fresh implementation rendering the same data as `SheetDialogContent` but with independent layout suited for a full page (not a dialog). Not a direct import or re-export of the dialog component.
- Renders sheet-specific data: internal level, level history, details table, notes stats, comments, rating table
- Designed for full-page layout (wider, can use more horizontal space than a modal)
- One instance per sheet, all rendered in DOM, visibility controlled by active tab

## Integration with Existing Code

### SheetListItem Link Change
- The `ListItemButton` in `SheetListItem.tsx` wraps content in an `<a href="/song/{songId}">` tag
- `onClick` calls `e.preventDefault()` and opens the modal as before
- Crawlers follow the `<a href>` to the song page; users get the modal

### Routing Change in App.tsx
- Add `<Route path="/song/:songId"><SongPage /></Route>` to the router
- `RootLayout` conditionally hides the search/rating `Tabs` on the song page (they're irrelevant in detail context), but keeps the top bar and version/region switcher visible

### Data Access
- Use `getSongs()` from `songs.ts` to find the song by `songId`
- Use `getFlattenedSheets()` to get the full sheet data with version-appropriate internal levels
- The song page doesn't need the full `useSheets()` hook (which loads tags/aliases for all songs) — it can load tags/aliases for just this song, or use `useSheets()` if simpler

## 404 Handling
- If `songId` doesn't match any song, show a simple "Song not found" message with a link back to `/search`

## Not In Scope
- URL-based tab state (no `?type=dx&difficulty=master`)
- Server-side rendering (this is a Vite SPA — `unhead` manages client-side `<head>`)
- Breadcrumb navigation
- Previous/next song navigation
