import * as d3 from "d3";

type ForceRequest = {
  id: number;
  nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  links: Array<{ source: string; target: string }>;
  linkDistance: number;
  chargeStrength: number;
  collidePad: number;
  iterations: number;
};

self.onmessage = (event: MessageEvent<ForceRequest>) => {
  const request = event.data;
  try {
    const nodes = request.nodes;
    const simulation = d3
      .forceSimulation(nodes as any)
      .alpha(1)
      .alphaDecay(0.035)
      .force(
        "link",
        d3
          .forceLink(request.links as any)
          .id((node: any) => node.id)
          .distance(request.linkDistance)
          .strength(0.85)
      )
      .force("charge", d3.forceManyBody().strength(request.chargeStrength))
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((node: any) => Math.max(node.width ?? 0, node.height ?? 0) / 2 + request.collidePad)
          .iterations(2)
      )
      .force("center", d3.forceCenter(0, 0));

    for (let i = 0; i < request.iterations; i++) simulation.tick();
    simulation.stop();
    self.postMessage({
      id: request.id,
      positions: nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    });
  } catch (error) {
    self.postMessage({ id: request.id, error: String(error) });
  }
};
