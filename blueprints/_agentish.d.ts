export {};

declare global {
  /**
   * 1. The Infinite Fluent Chain
   * ANY property accessed on this acts as a function that returns the chain itself.
   * e.g., .then(...).and(...).with(...).bypassing(...)
   */
  type AgentishChain = Record<string, (...args: any[]) => AgentishChain>;

  /**
   * 2. The Node Reference
   * Contains your required explicit properties (`id`, `_type`), but because 
   * it intersects with `Record<string, any>`, TypeScript lets you invent 
   * ANY verb on the fly (e.g., `Human.architects(...)`).
   */
  type NodeRef = Record<string, any> & {
    id: string;
    _type: 'NodeRef';
  };

  /**
   * 3. The Definition Factory
   * define.entity('Name', { ... }) -> NodeRef
   */
  const define: Record<
    string, 
    (id: string, opts?: Record<string, any>) => NodeRef
  >;

  /**
   * 4. The Global Entry Points
   * 'when' is no longer special. It is simply a function that accepts literally 
   * anything (Nodes, strings, objects) and kicks off the infinite chain.
   */
  const when: (...args: any[]) => AgentishChain;
}