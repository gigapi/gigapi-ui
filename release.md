# GIGAPI UI v1.0.12 

## New Features
- **Dashboards**: Introduced customizable dashboards with drag-and-drop panels
- **AI Chat Integration**: Added mini chat panel in query editor for quick SQL assistance and Chat Page with artifacts (ALPHA SUPER ALPHA STAGE)

## Technical Debt & Known Issues

### Charts/Visualizations
- Artifact (CHAT) rendering causes multiple re-renders impacting performance
- Singleton values (averages, totals) don't render multiple values **YET** 
- Data transformation for panel visualizations for some cases needs more work (on it...)

### AI Agent Integration
- Instructions to AI agents occasionally fail (particularly with Ollama opensource small models) Open ai with `gpt-4o-mini-2024-07-18` it's honest.. 
- Context passing between query editor and chat needs refinement

### Dashboard/Panels
- I'm working a lot with the panel data transformation so expect some issues (let me know too please :) ) 


I'm still working with lots of data transformation, also there are some UI flaws (looks ugly), but common lets break it togheter! We all deserve some fun! 