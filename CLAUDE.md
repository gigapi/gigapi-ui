# CLAUDE.md

This file provides comprehensive guidance to Claude Code when working with the GigAPI UI codebase.

## 🚨 CRITICAL RULES - ALWAYS FOLLOW

### 1. NEVER Add React.StrictMode
**File:** `/src/main.tsx`
- React.StrictMode causes Monaco editor to blink/flicker with React 19
- ALWAYS use: `ReactDOM.createRoot(document.getElementById("root")!).render(<App />);`
- NEVER wrap App in `<React.StrictMode>`

### 2. Custom localStorage Serialization for Strings
- Jotai's atomWithStorage uses JSON.stringify by default, adding extra quotes
- ALWAYS use custom serialization for string atoms:
```typescript
export const myStringAtom = atomWithStorage<string>("key", "", {
  getItem: (key) => localStorage.getItem(key) || "",
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
});
```

### 3. No Legacy Code or Migrations
- User is the ONLY one using this app
- Delete old code freely
- Don't worry about backwards compatibility
- Simplify everything possible

### 4. Development Philosophy
- Minimize code - less is more
- Don't create files unless absolutely necessary
- Always prefer editing existing files over creating new ones
- NEVER proactively create documentation files (*.md) unless explicitly requested

## Project Overview

GigAPI UI is a React-based web interface for querying time-series data using GigAPI (Catalog Metadata + DuckDB). The application provides:
- SQL query interface with Monaco editor
- Dashboard system for visualizing time-series data
- AI chat integration (MCP) for query generation
- Real-time database exploration

## Tech Stack
- **React 19** + TypeScript + Vite
- **State Management**: Jotai atoms (migrated from React Context)
- **UI**: shadcn/ui + Tailwind CSS v4
- **Storage**: localStorage (all data)
- **Backend**: Separate GigAPI server (not part of this codebase) accessible via API URL (defined by the user and we try to access it on startup)

## Key Architecture Decisions

### State Management - Jotai Atoms
All state is managed through Jotai atoms in `/src/atoms/`:
- **connection/** - API connection state and actions
- **query-atoms.ts** - Query execution, results, and history
- **database-atoms.ts** - Database/table selection and schema
- **time-atoms.ts** - Time range selection and time field detection
- **dashboard-atoms.ts** - Dashboard panels and visualization state
- **mcp-atoms.ts** - AI chat integration

### Connection Management
- Default API URL is generated from current window location
- Connection URL stored in localStorage as `gigapi_connection_url`
- IMPORTANT: Read localStorage synchronously on atom init to avoid empty URL

### Monaco Editor Integration
- Custom SQL language configuration with schema-aware autocomplete
- Time variable suggestions ($__timeFilter, $__timeField, etc.)
- Keyboard shortcuts (Cmd/Ctrl+Enter for execution)
- CRITICAL: React.StrictMode breaks Monaco - never use it

### Query Processing
The QueryProcessor class handles:
- Time variable interpolation for DuckDB compatibility
- Variables: `$__timeFilter`, `$__timeField`, `$__timeFrom`, `$__timeTo`
- All timestamps converted to nanoseconds
- Smart time field detection with confidence scoring

### Dashboard Architecture
- Grid layout using react-grid-layout
- Panel types: Time series, gauges, stats, tables
- Panels embedded within dashboard objects (not separate)
- Auto-refresh when time range changes

## Build Commands
- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run preview` - Preview production build

## Common Issues & Solutions

### Monaco Editor Blinking
- Cause: React.StrictMode double-mounting
- Solution: Remove StrictMode from main.tsx

### Connection Failures
- Check localStorage has correct API URL
- Default URL generation uses window.location
- API usually runs on different port than UI

### String Values with Extra Quotes
- Cause: JSON.stringify in atomWithStorage
- Solution: Use custom getItem/setItem functions

## Performance Optimizations
- Monaco editor setup with proper memoization
- Schema caching to avoid redundant API calls
- Debounced intellisense updates (100ms)
- Single useEffect for Monaco setup
- Proper cleanup of Monaco disposables

## Current State (as of this conversation)
- ✅ All features working correctly
- ✅ Connection management fixed and robust
- ✅ Monaco editor stable (no blinking)
- ✅ localStorage string serialization fixed
- ✅ All contexts migrated to Jotai atoms
- ✅ No legacy code or migrations needed

## Testing & Development Notes
- Test with large schemas for intellisense performance
- Verify Ctrl/Cmd+Enter works consistently
- Check database switching updates intellisense
- Ensure single connection attempt on startup

## AI Integration (MCP)
- Model Context Protocol for chat functionality
- AI receives full database schema context
- Can generate queries and chart configurations
- Custom instructions support

## Important File Locations
- `/src/atoms/` - All state management
- `/src/components/query/MonacoSqlEditor.tsx` - SQL editor
- `/src/lib/query-processor.ts` - Query processing logic
- `/src/main.tsx` - Entry point (NO StrictMode!)
- `/src/App.tsx` - Main app component with routing

## Final Notes
This is a single-user application. Prioritize:
1. Code simplicity over flexibility
2. Direct solutions over abstractions
3. Working features over perfect architecture
4. User experience over "best practices" that break things (like StrictMode)