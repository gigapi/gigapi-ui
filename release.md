# Release Notes - v2.0.0

## New Features
- **Dashboards**: Introduced customizable dashboards with drag-and-drop panels
- **AI Chat Integration**: Added mini chat panel in query editor for quick SQL assistance
- **Persistent Query History**: Query history now persists across page reloads

## Technical Debt & Known Issues

### Charts/Visualizations
- Artifact rendering causes multiple re-renders impacting performance
- Singleton values (averages, totals) don't render correctly in panels
- Data transformation for panel visualizations needs optimization

### AI Agent Integration
- Instructions to AI agents occasionally fail (particularly with OpenAI models)
- Context passing between query editor and chat needs refinement
- Session management could be more robust

### Dashboard/Panels
- Panel data transformation is the biggest bottleneck
- Dashboard state management needs optimization to reduce re-renders
- Panel resize/drag performance degrades with many panels

## Next Sprint Priorities
1. Optimize chart rendering pipeline
2. Implement proper data transformation layer for panels
3. Fix singleton value rendering in visualizations