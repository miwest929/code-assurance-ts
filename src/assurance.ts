#!/usr/bin/env node

import program from 'commander'
import { analyzeCodeQuality } from './index';

program
  .version('0.1.0')
  .option('-p, --path', 'Path to directory to run quality metrics against')
  .parse(process.argv);

  analyzeCodeQuality(program.path);