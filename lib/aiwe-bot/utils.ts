class Utils {

  public isValidAIWEConfig(config: any): boolean {
    if (!config || typeof config !== 'object') return false;
    
    // Check required top-level fields
    if (typeof config.service !== 'string' ||
        typeof config.description !== 'string' ||
        !Array.isArray(config.actions)) {
      return false;
    }
    
    // Validate each action
    return config.actions.every((action: any) => {
      if (typeof action.name !== 'string' ||
          typeof action.description !== 'string') {
        return false;
      }

      // Validate parameters if they exist
      if (action.parameters) {
        if (typeof action.parameters !== 'object') return false;

        // Check each parameter
        return Object.entries(action.parameters).every(([_, param]: [string, any]) => {
          if (!param || typeof param !== 'object') return false;
          
          // Required fields for a parameter
          if (typeof param.type !== 'string') return false;
          if ('required' in param && typeof param.required !== 'boolean') return false;

          // If it's an array type, validate items structure
          if (param.type === 'array' && param.items) {
            if (typeof param.items !== 'object') return false;
            
            // Validate each item parameter
            return Object.entries(param.items).every(([_, itemParam]: [string, any]) => {
              if (!itemParam || typeof itemParam !== 'object') return false;
              if (typeof itemParam.type !== 'string') return false;
              if ('required' in itemParam && typeof itemParam.required !== 'boolean') return false;
              return true;
            });
          }

          // If enum is specified, it must be an array
          if ('enum' in param && !Array.isArray(param.enum)) return false;

          return true;
        });
      }

      return true;
    });
  }

  public reorderActionPlan(actions: any[]): any[] {
    const actionMap = new Map<string, { id: string; website: string; parameters: any; outputKey: string; dependsOn?: string[] }>();
    const sortedActions: Array<{ id: string; website: string; parameters: any; outputKey: string; dependsOn?: string[] }> = [];
    const visited = new Set<string>();
    
    // Create a map for quick access
    actions.forEach(action => actionMap.set(action.id, action));
    
    function visit(action: { id: string; website: string; parameters: any; outputKey: string; dependsOn?: string[] }) {
        if (visited.has(action.id)) return;
        
        if (action.dependsOn) {
            action.dependsOn.forEach(dependencyId => {
                if (actionMap.has(dependencyId)) {
                    visit(actionMap.get(dependencyId)!);
                }
            });
        }
        
        visited.add(action.id);
        sortedActions.push(action);
    }
    
    actions.forEach(action => visit(action));
    
    return sortedActions;
  }
  
}

export default new Utils();