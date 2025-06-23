# Contributing to GigAPI UI

Thank you for your interest in contributing to GigAPI UI! This guide provides everything you need to know about the architecture, development workflow, and how to make meaningful contributions.

## 🚀 Getting Started

### Prerequisites

- **Bun** >= 1.0 (recommended) or Node.js >= 18
- **Git** for version control
- **Code Editor** with TypeScript support (VS Code recommended)

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/gigapi-ui.git
   cd gigapi-ui
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your GigAPI backend URL
   ```

4. **Start Development Server**
   ```bash
   bun dev
   ```

## 🏗 Architecture Deep Dive

### Core Principles

1. **Schema-Driven Design**: Database schema is the source of truth for data analysis and UI behavior
2. **Context-Based State**: Feature-specific React contexts manage related state and logic
3. **Type Safety First**: Comprehensive TypeScript coverage with strict typing
4. **Performance Focused**: Debounced operations, memoization, and efficient rendering
5. **Modular Components**: Reusable, composable components with clear responsibilities

### Directory Structure

```
src/
├── components/              # React components
│   ├── ui/                 # Base UI components (shadcn/ui)
│   │   ├── button.tsx      # Button component
│   │   ├── input.tsx       # Input component
│   │   └── ...
│   ├── QueryEditor.tsx     # SQL editor with intellisense
│   ├── GigChart.tsx        # Main chart component
│   ├── QueryResults.tsx    # Results table and pagination
│   ├── TimeRangeSelector.tsx # Time filtering UI
│   └── ...
├── contexts/               # State management contexts
│   ├── ConnectionContext.tsx   # API connection state
│   ├── DatabaseContext.tsx     # Schema and database state
│   ├── QueryContext.tsx        # Query execution and history
│   ├── TimeContext.tsx         # Time range management
│   └── MCPContext.tsx          # AI integration
├── lib/                    # Utility libraries
│   ├── charts/             # Chart analysis and generation
│   │   ├── chart-analysis.ts      # Data analysis and type detection
│   │   ├── chart-configuration.ts # Chart config utilities
│   │   └── chart-data-processing.ts # Data transformation
│   ├── formatting/         # Data formatting utilities
│   ├── query/              # Query processing
│   ├── storage/            # Local storage management
│   ├── time/               # Time handling utilities
│   └── url/                # URL state management
├── types/                  # TypeScript definitions
│   ├── index.ts            # Core type definitions
│   └── utils.types.ts      # Utility types
└── hooks/                  # Custom React hooks
```

## 🔧 Context Architecture

### 1. ConnectionContext (`src/contexts/ConnectionContext.tsx`)

**Purpose**: Manages API connections, database discovery, and connection state.

**Key Features**:
- Connection validation and retry logic
- Database list fetching and caching
- Connection persistence in localStorage
- Error handling and status reporting

**State**:
```typescript
interface ConnectionState {
  apiUrl: string;
  isConnected: boolean;
  databases: Database[];
  isLoading: boolean;
  error: string | null;
}
```

**When to modify**: Adding new API endpoints, changing connection logic, or adding authentication.

### 2. DatabaseContext (`src/contexts/DatabaseContext.tsx`)

**Purpose**: Manages database selection, schema loading, and table information.

**Key Features**:
- Database and table selection
- Schema fetching and caching
- Column information with type detection
- Time field identification from schema

**State**:
```typescript
interface DatabaseState {
  selectedDb: string;
  selectedTable: string | null;
  availableTables: string[];
  schema: SchemaInfo;
  isLoadingSchema: boolean;
}
```

**When to modify**: Adding new database types, changing schema parsing, or enhancing type detection.

### 3. QueryContext (`src/contexts/QueryContext.tsx`)

**Purpose**: Handles query execution, history, and result management.

**Key Features**:
- SQL query execution with time variable replacement
- Query history persistence
- Performance metrics tracking
- Result formatting and validation
- Error handling and reporting

**State**:
```typescript
interface QueryContextType {
  query: string;
  results: QueryResult[] | null;
  isLoading: boolean;
  error: string | null;
  queryHistory: QueryHistoryEntry[];
  performanceMetrics: PerformanceMetrics | null;
}
```

**When to modify**: Adding new query features, changing result processing, or adding caching.

### 4. TimeContext (`src/contexts/TimeContext.tsx`)

**Purpose**: Manages time ranges, time field selection, and time variable handling.

**Key Features**:
- Time range selection and validation
- Time field detection and selection
- Time variable replacement in queries
- Timezone handling
- Quick range presets

**State**:
```typescript
interface TimeContextType {
  timeRange: TimeRange;
  selectedTimeField: string | undefined;
  hasTimeVariables: boolean;
  availableTimeFields: string[];
}
```

**When to modify**: Adding new time formats, changing time variable logic, or adding timezone features.

### 5. MCPContext (`src/contexts/MCPContext.tsx`)

**Purpose**: Manages AI integration through Model Context Protocol.

**Key Features**:
- AI provider connections (Ollama, OpenAI, Anthropic)
- Chat session management
- Query generation from natural language
- Model selection and configuration

**When to modify**: Adding new AI providers, enhancing chat features, or improving query generation.

## 📊 Chart System Architecture

### Core Components

#### 1. Data Analysis (`src/lib/charts/chart-analysis.ts`)

**Key Functions**:
- `analyzeColumns()`: Analyzes query results with optional schema information
- `createDefaultChartConfiguration()`: Creates initial chart config based on data
- `updateChartConfiguration()`: Updates chart with new data and theme
- `generateLineChartConfig()`: Creates ECharts configuration for line charts
- `generateBarChartConfig()`: Creates ECharts configuration for bar charts
- `generateAreaChartConfig()`: Creates ECharts configuration for area charts

**Schema Integration**:
```typescript
export function analyzeColumns(
  data: QueryResult[], 
  schemaColumns?: ColumnSchema[]
): ColumnInfo[]
```

The function prioritizes schema information when available, falling back to data analysis for type detection.

#### 2. Chart Component (`src/components/GigChart.tsx`)

**Key Features**:
- Auto-configuration based on data and schema
- Interactive chart type selection
- Field mapping configuration (X-axis, Y-axis, groupBy)
- Styling controls (legend, grid, smoothing)
- Export/import functionality
- Theme integration

**Props Interface**:
```typescript
interface GigChartProps {
  data: QueryResult[];
  initialConfiguration?: ChartConfiguration;
  onConfigurationChange?: (config: ChartConfiguration) => void;
  schemaColumns?: ColumnSchema[];
}
```

### Adding New Chart Types

1. **Add Chart Type to Types**:
   ```typescript
   // src/types/index.ts
   export type ChartType = "line" | "bar" | "area" | "pie" | "scatter";
   ```

2. **Create Chart Generation Function**:
   ```typescript
   // src/lib/charts/chart-analysis.ts
   function generatePieChartConfig(
     data: Record<string, any>[],
     config: ChartConfiguration,
     themeColors: ThemeColors
   ): any {
     // Implementation here
   }
   ```

3. **Add to Chart Type Switch**:
   ```typescript
   // In updateChartConfiguration()
   switch (config.type) {
     case "pie":
       echartsConfig = generatePieChartConfig(chartData, config, themeColors);
       break;
     // ... other cases
   }
   ```

4. **Update UI Components**:
   ```typescript
   // src/components/GigChart.tsx
   const chartTypeIcons = {
     line: LineChart,
     bar: BarChart3,
     area: AreaChart,
     pie: PieChart, // Add new icon
   } as const;
   ```

## 🎨 UI Component Guidelines

### Using shadcn/ui Components

We use [shadcn/ui](https://ui.shadcn.com/) for base components. All UI components should:

1. **Follow shadcn/ui patterns** for consistency
2. **Support theming** through CSS variables
3. **Be accessible** with proper ARIA attributes
4. **Be composable** and reusable

### Adding New UI Components

1. **Install shadcn/ui component**:
   ```bash
   bunx shadcn-ui@latest add [component-name]
   ```

2. **Custom components should**:
   - Use TypeScript interfaces for props
   - Support forwardRef when appropriate
   - Include proper TypeScript documentation
   - Follow naming conventions (PascalCase)

### Theme System

The app supports light/dark themes through CSS variables defined in `src/index.css`. All components should use these variables for colors:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 240 9% 9%;
  /* ... */
}

[data-theme="dark"] {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  /* ... */
}
```

## 🔍 Type System

### Core Types (`src/types/index.ts`)

Key interfaces you'll work with:

```typescript
// Database and Schema
interface ColumnSchema {
  columnName: string;
  dataType: string;
  timeUnit?: TimeUnit;
}

interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
}

// Query and Results
type QueryResult = Record<string, any>;

interface QueryHistoryEntry {
  id: string;
  query: string;
  timestamp: string;
  success: boolean;
  // ...
}

// Chart Configuration
interface ChartConfiguration {
  id: string;
  title: string;
  type: "line" | "bar" | "area";
  fieldMapping: {
    xAxis: string | null;
    yAxis: string | null;
    groupBy: string | null;
  };
  // ...
}

// Column Analysis
interface ColumnInfo {
  name: string;
  type: DataType;
  isTimeField?: boolean;
  timeUnit?: TimeUnit;
  role?: ColumnRole;
  contentType?: ColumnContentType;
  originalType?: string; // Original database schema type
}
```

### Adding New Types

1. **Define in appropriate section** of `src/types/index.ts`
2. **Export from index** for easy importing
3. **Document complex types** with JSDoc comments
4. **Use strict typing** - avoid `any` when possible

## 🧪 Testing Strategy

### Unit Tests
- Test utility functions in isolation
- Mock external dependencies
- Focus on business logic and data transformations

### Integration Tests
- Test context providers with React Testing Library
- Test component interactions
- Verify chart generation with sample data

### End-to-End Tests
- Test complete user workflows
- Verify query execution and visualization
- Test error scenarios and recovery

## 🚀 Performance Guidelines

### React Performance

1. **Use React.memo** for expensive components
2. **Optimize context providers** to prevent unnecessary re-renders
3. **Use useMemo and useCallback** judiciously
4. **Implement debouncing** for user input

### Chart Performance

1. **Limit data points** for large datasets
2. **Use data sampling** when appropriate
3. **Debounce chart updates** during configuration changes
4. **Optimize ECharts options** for performance

### Bundle Size

1. **Use dynamic imports** for large dependencies
2. **Tree-shake unused code**
3. **Monitor bundle size** with `bun build --analyze`

## 📝 Code Style Guidelines

### TypeScript

- Use **strict mode** configurations
- Prefer **interfaces over types** for object shapes
- Use **const assertions** for immutable data
- Document **public APIs** with JSDoc

### React

- Use **functional components** with hooks
- Prefer **custom hooks** for reusable logic
- Use **TypeScript generic components** when appropriate
- Follow **hooks rules** strictly

### File Organization

- **One main export** per file
- **Group related utilities** in index files
- **Use descriptive file names**
- **Consistent import ordering**

### Naming Conventions

- **Components**: PascalCase (`QueryEditor.tsx`)
- **Files**: kebab-case for utilities (`chart-analysis.ts`)
- **Variables**: camelCase (`isLoading`, `chartConfig`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_COLORS`)

## 🐛 Debugging Tips

### Common Issues

1. **Chart not rendering**: Check ECharts configuration and data format
2. **Context not updating**: Verify provider hierarchy and dependencies
3. **Type errors**: Ensure schema and data types match
4. **Performance issues**: Profile with React DevTools

### Development Tools

- **React DevTools**: Component tree and state inspection
- **Redux DevTools**: For context state debugging (with middleware)
- **Browser DevTools**: Network, Console, and Performance tabs
- **TypeScript compiler**: `bun type-check` for type validation

## 📋 Pull Request Guidelines

### Before Submitting

1. **Run tests**: `bun test` (when available)
2. **Check types**: `bun type-check`
3. **Lint code**: `bun lint`
4. **Test manually** with different data types
5. **Update documentation** if needed

### PR Description Template

```markdown
## Changes
- Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested with sample data
- [ ] Verified chart functionality
- [ ] Checked responsive design
- [ ] Tested error scenarios

## Screenshots
(Include screenshots for UI changes)

## Additional Notes
(Any additional context or considerations)
```

### Review Process

1. **Automated checks** must pass
2. **Manual testing** by maintainers
3. **Code review** focusing on architecture and performance
4. **Documentation review** for user-facing changes

## 🤝 Community Guidelines

### Getting Help

- **GitHub Discussions**: For questions and community support
- **GitHub Issues**: For bug reports and feature requests
- **Code Review**: For implementation feedback

### Best Practices

- **Be respectful** and constructive in feedback
- **Search existing issues** before creating new ones
- **Provide context** and examples in bug reports
- **Test thoroughly** before submitting PRs

### Recognition

Contributors are recognized through:
- GitHub contributor listings
- Release notes acknowledgments
- Community showcases

---

Thank you for contributing to GigAPI UI! Your efforts help make data visualization more accessible and powerful for everyone. 🚀