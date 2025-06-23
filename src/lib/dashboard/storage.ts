import { type Dashboard, type DashboardListItem, type PanelConfig } from "@/types/dashboard.types";

const DB_NAME = "GigapiDashboards";
const DB_VERSION = 1;

interface DashboardDB extends IDBDatabase {
  // Type augmentation for better TypeScript support
}

class DashboardStorage {
  private dbPromise: Promise<DashboardDB>;

  constructor() {
    this.dbPromise = this.initDB();
  }

  private async initDB(): Promise<DashboardDB> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as DashboardDB);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result as DashboardDB;

        // Create dashboards store
        if (!db.objectStoreNames.contains("dashboards")) {
          const dashboardStore = db.createObjectStore("dashboards", {
            keyPath: "id",
          });
          
          // Create indexes for searching
          dashboardStore.createIndex("name", "name", { unique: false });
          dashboardStore.createIndex("createdAt", "metadata.createdAt", { unique: false });
          dashboardStore.createIndex("updatedAt", "metadata.updatedAt", { unique: false });
          dashboardStore.createIndex("tags", "metadata.tags", { unique: false, multiEntry: true });
        }

        // Create panels store (separate from dashboards for better performance)
        if (!db.objectStoreNames.contains("panels")) {
          const panelStore = db.createObjectStore("panels", {
            keyPath: "id",
          });
          
          panelStore.createIndex("dashboardId", "dashboardId", { unique: false });
          panelStore.createIndex("type", "type", { unique: false });
        }
      };
    });
  }

  // Dashboard operations
  async saveDashboard(dashboard: Dashboard): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["dashboards"], "readwrite");
    const store = transaction.objectStore("dashboards");
    
    return new Promise((resolve, reject) => {
      const request = store.put({
        ...dashboard,
        metadata: {
          ...dashboard.metadata,
          createdAt: dashboard.metadata.createdAt.toISOString(),
          updatedAt: dashboard.metadata.updatedAt.toISOString(),
        },
      });
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getDashboard(id: string): Promise<Dashboard | null> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["dashboards"], "readonly");
    const store = transaction.objectStore("dashboards");
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        
        // Convert date strings back to Date objects
        resolve({
          ...result,
          metadata: {
            ...result.metadata,
            createdAt: new Date(result.metadata.createdAt),
            updatedAt: new Date(result.metadata.updatedAt),
          },
        });
      };
    });
  }

  async deleteDashboard(id: string): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["dashboards", "panels"], "readwrite");
    const dashboardStore = transaction.objectStore("dashboards");
    const panelStore = transaction.objectStore("panels");
    
    return new Promise((resolve, reject) => {
      // Delete dashboard
      dashboardStore.delete(id);
      
      // Delete associated panels
      const panelIndex = panelStore.index("dashboardId");
      const panelRequest = panelIndex.openCursor(IDBKeyRange.only(id));
      
      panelRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }

  async listDashboards(): Promise<DashboardListItem[]> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["dashboards"], "readonly");
    const store = transaction.objectStore("dashboards");
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const dashboards = request.result.map((dashboard: any): DashboardListItem => ({
          id: dashboard.id,
          name: dashboard.name,
          description: dashboard.description,
          tags: dashboard.metadata.tags,
          createdAt: new Date(dashboard.metadata.createdAt),
          updatedAt: new Date(dashboard.metadata.updatedAt),
          panelCount: dashboard.layout.panels.length,
        }));
        
        // Sort by updatedAt descending
        dashboards.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        
        resolve(dashboards);
      };
    });
  }

  async searchDashboards(query: string): Promise<DashboardListItem[]> {
    const allDashboards = await this.listDashboards();
    
    if (!query.trim()) {
      return allDashboards;
    }
    
    const searchTerms = query.toLowerCase().split(" ");
    
    return allDashboards.filter(dashboard => {
      const searchText = [
        dashboard.name,
        dashboard.description || "",
        ...(dashboard.tags || []),
      ].join(" ").toLowerCase();
      
      return searchTerms.every(term => searchText.includes(term));
    });
  }

  // Panel operations (if we want to store panels separately)
  async savePanel(panel: PanelConfig & { dashboardId: string }): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["panels"], "readwrite");
    const store = transaction.objectStore("panels");
    
    return new Promise((resolve, reject) => {
      const request = store.put(panel);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getPanelsForDashboard(dashboardId: string): Promise<PanelConfig[]> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["panels"], "readonly");
    const store = transaction.objectStore("panels");
    const index = store.index("dashboardId");
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(dashboardId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deletePanel(panelId: string): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["panels"], "readwrite");
    const store = transaction.objectStore("panels");
    
    return new Promise((resolve, reject) => {
      const request = store.delete(panelId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // Utility methods
  async clearAllData(): Promise<void> {
    const db = await this.dbPromise;
    const transaction = db.transaction(["dashboards", "panels"], "readwrite");
    
    return new Promise((resolve, reject) => {
      const dashboardStore = transaction.objectStore("dashboards");
      const panelStore = transaction.objectStore("panels");
      
      dashboardStore.clear();
      panelStore.clear();
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }

  async exportDashboard(id: string): Promise<string> {
    const dashboard = await this.getDashboard(id);
    if (!dashboard) {
      throw new Error("Dashboard not found");
    }
    
    const panels = await this.getPanelsForDashboard(id);
    
    const exportData = {
      dashboard,
      panels,
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  async importDashboard(jsonData: string): Promise<string> {
    const importData = JSON.parse(jsonData);
    const { dashboard, panels } = importData;
    
    // Generate new IDs to avoid conflicts
    const newId = crypto.randomUUID();
    
    const newDashboard: Dashboard = {
      ...dashboard,
      id: newId,
      name: `${dashboard.name} (Imported)`,
      metadata: {
        ...dashboard.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    
    // Save dashboard
    await this.saveDashboard(newDashboard);
    
    // Save panels with new dashboard ID
    for (const panel of panels) {
      await this.savePanel({
        ...panel,
        id: crypto.randomUUID(),
        dashboardId: newId,
      });
    }
    
    return newId;
  }
}

// Singleton instance
export const dashboardStorage = new DashboardStorage();

// Convenience hook
export function useDashboardStorage() {
  return dashboardStorage;
}