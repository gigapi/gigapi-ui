# GigAPI UI - Modern Time-Series Data Visualization

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

> [!WARNING]  
> GigAPI is an open beta developed in public. Bugs and changes should be expected. Use at your own risk.

A powerful, modern web interface for querying and visualizing time-series data using GigAPI Catalog Metadata + DuckDB. Built with React, TypeScript, and featuring advanced charting capabilities with schema-driven data analysis.

![GigAPI UI Screenshot](https://github.com/user-attachments/assets/fa3788a2-9a5b-47bf-b6ef-f818ba62a404)

## ✨ Features

### 🔍 **Smart Query Interface**
- **Monaco Editor** with SQL syntax highlighting and autocomplete
- **Schema-aware intellisense** with table and column suggestions
- **Time variable support** (`$__timeFilter`, `$__timeField`, `$__timeFrom`, `$__timeTo`)
- **Query history** with persistence and sharing capabilities
- **Real-time validation** and error reporting

### 📊 **Advanced Data Visualization**
- **Multiple chart types**: Line, Bar, Area charts with ECharts
- **Schema-driven analysis**: Automatic type detection from database schema
- **Interactive tooltips** with color badges and formatted values
- **Smart field mapping**: Auto-detection of time fields and numeric measures
- **Responsive design** with configurable panels

### 🤖 **AI Integration (Alpha)**
- **Universal AI provider support** with custom headers and parameters
- **Query generation** from natural language prompts
- **Data analysis** and insights with context awareness
- **Flexible configuration** supporting any OpenAI-compatible API

### ⚡ **Performance & UX**
- **Real-time performance metrics** tracking
- **Debounced operations** for smooth interactions
- **Connection management** with auto-reconnection
- **Local storage** for preferences and history
- **Dark/Light theme** support

## 🚀 Quick Start

### Prerequisites
- **Bun** (recommended) or Node.js 18+
- **GigAPI backend** running and accessible

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd gigapi-ui

# Install dependencies
bun install

# Start development server
bun dev
```

### Environment Setup

Create a `.env.local` file:

```env
# GigAPI Backend URL
VITE_GIGAPI_URL=http://localhost:8080

# Optional: Default database connection
VITE_DEFAULT_DB=your_database_name
```

## 🏗 Architecture Overview

GigAPI UI follows a modern React architecture with TypeScript, emphasizing modularity and type safety:

```
src/
├── components/          # React components
│   ├── ui/             # Reusable UI components (shadcn/ui)
│   ├── QueryEditor.tsx # SQL editor with intellisense
│   ├── GigChart.tsx    # Chart visualization component
│   └── ...
├── contexts/           # React contexts for state management
│   ├── ConnectionContext.tsx  # API connection management
│   ├── DatabaseContext.tsx    # Database and schema state
│   ├── QueryContext.tsx       # Query execution and history
│   ├── TimeContext.tsx        # Time range and field management
│   └── MCPContext.tsx         # AI integration
├── lib/                # Utility libraries
│   ├── charts/         # Chart analysis and configuration
│   ├── formatting/     # Data formatting utilities
│   ├── query/          # Query processing and validation
│   ├── storage/        # Local storage management
│   ├── time/           # Time handling utilities
│   └── url/            # URL state management
└── types/              # TypeScript type definitions
```

### Key Architectural Principles

1. **Context-Driven State Management**: Each major feature area has its own React context
2. **Schema-First Approach**: Database schema drives UI behavior and chart analysis
3. **Type Safety**: Comprehensive TypeScript coverage with strict typing
4. **Separation of Concerns**: Clear boundaries between UI, state, and business logic
5. **Performance Optimization**: Debounced operations, memoization, and efficient re-renders

## 🔧 Development

### Available Scripts

```bash
# Development
bun dev          # Start development server with HMR
bun build        # Build for production
bun preview      # Preview production build locally

# Code Quality
bun lint         # Run ESLint
bun type-check   # Run TypeScript compiler check
```

### Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and building
- **UI Library**: shadcn/ui components with Tailwind CSS
- **Charts**: ECharts for advanced data visualization
- **Editor**: Monaco Editor for SQL editing
- **State Management**: React Context API
- **HTTP Client**: Axios for API communication
- **Package Manager**: Bun (recommended) or npm

## 📚 Usage Guide

### Basic Workflow

1. **Connect to Database**
   - Enter your GigAPI backend URL
   - Select database from available options
   - Schema is automatically loaded and cached

2. **Write Queries**
   - Use Monaco editor with SQL syntax highlighting
   - Leverage autocomplete for tables and columns
   - Use time variables for dynamic filtering

3. **Visualize Results**
   - Charts auto-configure based on data types
   - Customize chart type, axes, and styling
   - Export charts or share query URLs

### Time Variables

GigAPI UI supports special time variables for dynamic queries:

- `$__timeFilter` - Complete WHERE clause for time filtering
- `$__timeField` - Selected time field name
- `$__timeFrom` / `$__timeTo` - Start and end timestamps

Example:
```sql
SELECT 
  __timestamp,
  temperature,
  humidity
FROM sensor_data 
WHERE $__timeFilter
ORDER BY __timestamp
```

### AI Configuration Examples

GigAPI UI supports any AI provider through flexible configuration. The system automatically detects the correct API endpoint based on your base URL.

#### Ollama (Local)
```json
{
  "name": "Local Ollama",
  "baseUrl": "http://localhost:11434",
  "model": "llama3:latest"
}
```

#### OpenAI
```json
{
  "name": "OpenAI GPT-4",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4o-mini-2024-07-18",
  "headers": {
    "Authorization": "Bearer your-api-key-here"
  }
}
```

#### OpenAI-Compatible APIs (Together AI, OpenRouter, etc.)
```json
{
  "name": "Together AI",
  "baseUrl": "https://api.together.xyz/v1",
  "model": "meta-llama/Llama-3-8b-chat-hf",
  "headers": {
    "Authorization": "Bearer your-api-key-here"
  }
}
```

#### Anthropic Claude
```json
{
  "name": "Claude",
  "baseUrl": "https://api.anthropic.com/v1",
  "model": "claude-3-sonnet-20240229",
  "headers": {
    "x-api-key": "your-api-key-here",
    "anthropic-version": "2023-06-01"
  }
}
```

#### Azure OpenAI
```json
{
  "name": "Azure OpenAI",
  "baseUrl": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
  "model": "gpt-4",
  "headers": {
    "api-key": "your-api-key-here"
  },
  "params": {
    "api-version": "2024-02-01"
  }
}
```

#### Custom Provider with Headers and Parameters
```json
{
  "name": "Custom Provider",
  "baseUrl": "https://your-provider.com/v1",
  "model": "your-model-name",
  "headers": {
    "Authorization": "Bearer your-token",
    "X-Custom-Header": "custom-value"
  },
  "params": {
    "api_version": "2024-01",
    "region": "us-east-1"
  }
}
```

**Automatic Endpoint Detection:**
- OpenAI-style APIs: Automatically appends `/chat/completions` 
- Ollama: Automatically appends `/api/chat`
- If your base URL already includes the full endpoint, it will be used as-is

#### Custom Provider
```json
{
  "name": "Custom AI",
  "baseUrl": "https://your-custom-ai.com/v1",
  "model": "your-model-name",
  "headers": {
    "Authorization": "Bearer your-token",
    "X-Custom-Header": "custom-value"
  },
  "params": {
    "temperature": "0.7",
    "max_tokens": "2000"
  }
}
```

### Chart Configuration

Charts automatically analyze your data and:
- Detect time fields based on schema and naming patterns
- Identify numeric measures for Y-axis
- Suggest appropriate chart types
- Configure proper time formatting and scales

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines on:
- Setting up the development environment
- Understanding the codebase architecture
- Making changes to different components
- Adding new features and chart types
- Testing and quality assurance

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed architecture info
- **Issues**: Report bugs and request features via GitHub Issues
- **Discussions**: Use GitHub Discussions for questions and community support

## 🔮 Roadmap

- [ ] Additional chart types (Pie, Scatter, Heatmap)
- [ ] Dashboard creation and management
- [ ] Query result caching and offline mode
- [ ] Advanced AI features and query optimization
- [ ] Plugin system for custom visualizations
- [ ] Real-time data streaming support

---

Built with ❤️ by the GigAPI team