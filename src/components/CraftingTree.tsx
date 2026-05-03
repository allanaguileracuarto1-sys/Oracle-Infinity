import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { RecipeTree } from '../types';

interface CraftingTreeProps {
  data: RecipeTree;
}

interface NodeData {
  name: string;
  emoji?: string;
  children?: NodeData[];
}

export const CraftingTree: React.FC<CraftingTreeProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data || !data.steps) return;

    const svgElement = d3.select(svgRef.current);
    svgElement.selectAll("*").remove();

    // Transform steps into a tree structure
    const buildTree = (itemName: string, depth = 0): NodeData => {
      // Limit depth to prevent infinite loops or massive trees
      if (depth > 15) return { name: itemName };

      const step = data.steps.find(s => s.result.toLowerCase() === itemName.toLowerCase());
      if (!step) {
        return { name: itemName };
      }
      return {
        name: itemName,
        emoji: step.emoji,
        children: step.ingredients.map(ing => buildTree(ing, depth + 1))
      };
    };

    const rootData = buildTree(data.target);

    // Setup dimensions and tree layout
    const margin = { top: 20, right: 120, bottom: 20, left: 120 };
    
    // Use nodeSize for dynamic spacing
    const treeLayout = d3.tree<NodeData>()
      .nodeSize([40, 200]); // [height, width] between nodes

    const root = d3.hierarchy(rootData);
    treeLayout(root);

    // Calculate bounds
    let x0 = Infinity;
    let x1 = -Infinity;
    root.each(d => {
      if (d.x < x0) x0 = d.x;
      if (d.x > x1) x1 = d.x;
    });

    const height = x1 - x0 + margin.top + margin.bottom;
    const width = 1000; // Base width, will be zoomable

    const svg = svgElement
      .attr("viewBox", [0, 0, width, height])
      .attr("width", "100%")
      .attr("height", "100%")
      .style("font", "12px 'Inter', sans-serif")
      .style("user-select", "none");

    const g = svg.append("g");

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Initial transform to center the tree
    const initialScale = 0.6;
    const initialY = (height / 2) - (x0 + x1) / 2 * initialScale;
    svg.call(zoom.transform, d3.zoomIdentity
      .translate(margin.left, initialY + margin.top)
      .scale(initialScale));

    // Links with curves
    g.append("g")
      .attr("fill", "none")
      .attr("stroke", "rgba(255, 255, 255, 0.1)")
      .attr("stroke-width", 1.5)
      .selectAll("path")
      .data(root.links())
      .join("path")
      .attr("d", d3.linkHorizontal<any, any>()
        .x(d => d.y)
        .y(d => d.x));

    // Nodes
    const node = g.append("g")
      .selectAll("g")
      .data(root.descendants())
      .join("g")
      .attr("transform", d => `translate(${d.y},${d.x})`);

    // Node background (pill shape)
    node.append("rect")
      .attr("y", -14)
      .attr("x", d => d.children ? -110 : 0)
      .attr("width", 110)
      .attr("height", 28)
      .attr("rx", 14)
      .attr("fill", "#1A1A1B")
      .attr("stroke", "rgba(255, 255, 255, 0.1)")
      .attr("stroke-width", 1);

    // Node text
    node.append("text")
      .attr("dy", "0.35em")
      .attr("x", d => d.children ? -55 : 55)
      .attr("text-anchor", "middle")
      .attr("fill", "#E4E4E7")
      .style("font-weight", "500")
      .style("font-size", "10px")
      .text(d => {
        const name = d.data.name;
        const emoji = d.data.emoji || "";
        const label = `${emoji} ${name}`;
        return label.length > 18 ? label.substring(0, 15) + "..." : label;
      });

    // Tooltip on hover
    node.append("title")
      .text(d => d.data.name);

  }, [data]);

  return (
    <div className="w-full h-[600px] bg-[#0A0A0B] rounded-3xl border border-white/10 overflow-hidden relative group">
      <div className="absolute top-6 left-6 z-20">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono mb-1">
          Topology Visualization
        </div>
        <div className="text-[9px] text-orange-500/60 font-mono uppercase">
          Drag to pan • Scroll to zoom
        </div>
      </div>
      
      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      
      <div className="absolute bottom-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-mono text-white/40 uppercase tracking-widest">
          {data.target}
        </div>
      </div>
    </div>
  );
};
