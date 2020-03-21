import * as fs from "fs";
import { parse, TSESTreeOptions } from "@typescript-eslint/typescript-estree";

const options: TSESTreeOptions = {
    comment: false,
    jsx: false
}

const isTypeScriptSource = (filename: string): boolean => {
    return filename.endsWith('.ts');
}

const getTypescriptSourcesRecursive = (path: string): string[] => {
    const sourceFiles = [];
    fs.readdirSync(path).forEach(file => {
        if (isTypeScriptSource(file)) {
          sourceFiles.push(file);
        }
    });
    return sourceFiles;
}

/*
  Assignment Branch Condition size is a synthetic metric which helps us understand the size of the source code
  from a structural point of view, i.e. without looking at superficial things like the sheer amount of code.
  It is computed by counting the number of assignments, branches and conditions for a given section of code.
  These are - slightly counterintuitively - defined as:

  Assignment: an explicit transfer of data into a variable, e.g. =, *=, /=, %=, +=, <<=, >>=, &=, |=, ^=, >>>=, ++, -- etc.;
  Branch: an explicit forward program branch out of scope, e.g. a function call, class method call, or new operator etc.;
  Condition: a logical/Boolean test, e.g. ==, !=, <=, >=, <, >, else, case, default, try, catch, ?, unary conditionals etc.;
*/

// DEVELOPER NOTE: Parsing heteregenous parse trees can benefit from the application of the
// Visitor pattern (double dispatch) and Intepreter pattern (recursive function)
// See: https://stackoverflow.com/a/31130000

interface ABCMetric {
  assignments: number;
  branches: number;
  conditionals: number;
}
type FunctionQualityMetric = Map<string, ABCMetric>;

class CodeQualityAnalyzer {
  private projectPath: string;

  constructor(path: string) {
      this.projectPath = path;
  }

  public run() {
      const sources = getTypescriptSourcesRecursive(this.projectPath);
      console.log(`Will analyze the following Typescript source files: ${sources.join(', ')}`);

      for (const s of sources) {
          this.analyzeSingleSource(s);
      }
  }

  private getSourceFileAST(code: string) {
    return parse(code, options);      
  }

  private discoverFunctionsFromAST(ast: any) {
      const functions = [];
      let queue = ast.body;
      while (queue.length > 0) {
          const node = queue.shift(); // remove from beginning of list
          if (node.type === "FunctionDeclaration" || node.type === "MethodDefinition") {
            functions.push(node);
          } else if (node.type === "ClassDeclaration") {
            queue = queue.concat(node.body.body); // node.body is the ClassBody node type
          } else if (node.type === "ExportNamedDeclaration" && node.declaration.type === "ClassDeclaration") {
            queue = queue.concat(node.declaration.body.body);
          }
      }

      return functions;
  }

  private analyzeSingleFunction(functionNode: any): number[] {
    if (!functionNode) {
        return [0, 0, 0];
    }
    //console.log('---', functionNode, '-----');
    let assignments = 0;
    let branches = 0;
    let conditionals = 0;
    for (const node of functionNode.body) {
        console.log(node);
        if (node.type === "VariableDeclaration") {
            assignments += 1;
        } else if (node.type === "IfStatement") {
            conditionals += 1;
        }
    }

    return [assignments, branches, conditionals];
  }

  // Returns ABC metrics for each discovered function
  private analyzeSingleSource(source: string): Map<string, number[]> {
    console.log(`Analyzing source '${source}'...`);

    const code = fs.readFileSync(`${this.projectPath}/${source}`).toString();
    const ast = this.getSourceFileAST(code);
    const functions = this.discoverFunctionsFromAST(ast);

    const abcMetrices: Map<string, number[]> = new Map<string, number[]>();
    for (const fn of functions) {
        if (fn.type === "MethodDefinition") {
            const fnName = fn.key.name;
            abcMetrices.set(fnName, this.analyzeSingleFunction(fn.value.body));
        } else if (fn.type === "FunctionDeclaration") {
            const fnName = fn.id.name;
            abcMetrices.set(fnName, this.analyzeSingleFunction(fn.body));
        }
    }

    return abcMetrices;
  }
};

export function analyzeCodeQuality(path: string) {
    console.log(`Analyzing code quality of project '${path}'`);

    const analyzer = new CodeQualityAnalyzer(path);
    analyzer.run();
}