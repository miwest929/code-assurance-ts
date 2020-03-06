#!/usr/bin/env node

import program from 'commander'
import { analyzeCodeQuality } from './index';

const DEFAULT_PROJECT = '.';

program
  .version('0.1.0')
  .option('-p, --path <path>', 'Path to directory to run quality metrics against', DEFAULT_PROJECT)
  .parse(process.argv);

  analyzeCodeQuality(program.path);