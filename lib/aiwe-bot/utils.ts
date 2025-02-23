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

  public reorderActionPlan(actionPlan: any[]): any[] {
    const orderedPlan: any[] = [];
    const availableOutputs = new Set<string>();
    const unprocessedActions = [...actionPlan];

    while (unprocessedActions.length > 0) {
      const actionIndex = unprocessedActions.findIndex(action => {
        return !action.dependsOn || 
               action.dependsOn.every((dep: string) => availableOutputs.has(dep));
      });

      if (actionIndex === -1) {
        throw new Error("Circular dependency detected in action plan");
      }

      const nextAction = unprocessedActions.splice(actionIndex, 1)[0];
      orderedPlan.push(nextAction);

      if (nextAction.outputKey) {
        availableOutputs.add(nextAction.outputKey);
      }
    }

    return orderedPlan;
  }
  
}

export default new Utils();