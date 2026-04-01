import React from 'react';
import { motion } from 'motion/react';
import { RecipeTree } from '../services/geminiService';
import { Zap, ArrowRight, Box, AlertTriangle } from 'lucide-react';

interface CraftingStepsProps {
  data: RecipeTree;
  onReportStep?: (ingredients: [string, string], reportedResult: string, parentTarget: string) => void;
}

export const CraftingSteps: React.FC<CraftingStepsProps> = ({ data, onReportStep }) => {
  if (!data.steps || data.steps.length === 0) {
    return (
      <div className="p-8 rounded-3xl bg-white/5 border border-white/10 text-center">
        <Box className="w-8 h-8 text-white/20 mx-auto mb-4" />
        <p className="text-sm text-white/40 uppercase tracking-widest font-mono">
          This is a base element. No crafting steps required.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 flex items-center gap-2">
          <Zap className="w-3 h-3 text-orange-500" />
          Crafting Sequence
        </h2>
        <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
          {data.steps.length} Steps Total
        </span>
      </div>

      <div className="grid gap-3">
        {data.steps.map((step, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-orange-500/30 transition-all"
          >
            <div className="flex items-center gap-4 w-full">
              <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-mono text-white/40 shrink-0">
                {index + 1}
              </div>

              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 text-xs font-medium text-white/80 truncate">
                  {step.ingredients[0]}
                </div>
                <span className="text-white/20 text-xs font-bold">+</span>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 text-xs font-medium text-white/80 truncate">
                  {step.ingredients[1]}
                </div>
                <ArrowRight className="w-3 h-3 text-white/20 shrink-0" />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs font-bold text-orange-500 truncate">
                  <span className="text-sm">{step.emoji}</span>
                  {step.result}
                </div>
              </div>

              {onReportStep && (
                <button
                  onClick={() => onReportStep(step.ingredients, step.result, data.target)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/20 hover:text-red-500 transition-all group/btn"
                  title="Report incorrect combination"
                >
                  <AlertTriangle className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 p-6 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-center justify-center gap-4">
        <div className="text-center">
          <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-1">Final Result</p>
          <div className="text-2xl font-bold text-white flex items-center gap-3">
            <span>{data.emoji}</span>
            <span className="uppercase tracking-tighter">{data.target}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
