import * as fs from "fs";
import { parse, TSESTreeOptions } from "@typescript-eslint/typescript-estree";

const options: TSESTreeOptions = {
  comment: false,
  jsx: false
}

const isTypeScriptSource = (filename: string): boolean => {
    return filename.endsWith('.ts');
}

const recursivelyGetTypescriptSources = (path: string): string[] => {
    const sourceFiles = [];
    fs.readdirSync(path).forEach(file => {
        if (isTypeScriptSource(file)) {
          sourceFiles.push(file);
        }
    });
    return sourceFiles;
}

abstract class NodeVisitor {
  protected node: any;

  constructor(node: any) {
    this.node = node;
  }

  // Every node type requires specialized visiting logic.
  // @return ABCMetric -> visit method will crawl its node's tree and return the computed ABCMetric
  abstract visit(): ABCMetric;

  getNode(): any {
    return this.node;
  }
}

class VariableDeclarationVisitor extends NodeVisitor {
  constructor(node: any) {
    super(node);
  }

  visit() {
    for (const declare of this.node.declarations) {
      console.log(declare.init[0]);
    }
    return new ABCMetric();
  }
}

function createVisitorFrom(node: any): NodeVisitor {
  if (node.type === "VariableDeclaration") {
    return new VariableDeclarationVisitor(node);
  } else {
    throw `Unknown node type of ${node.type}. Failed to create visitor instance for it`;
  }
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

interface ABCMetricData {
  assignments: number;
  branches: number;
  conditionals: number;
}

class ABCMetric {
  private values: ABCMetricData;

  constructor() {
    this.values = this.emptyABCMetric();
  }

  combineWith(otherMetric: ABCMetric) {
    this.values.assignments += otherMetric.values.assignments;
    this.values.branches += otherMetric.values.branches;
    this.values.conditionals += otherMetric.values.conditionals;
  }

  public assignments(): number {
    return this.values.assignments;
  }

  public branches(): number {
    return this.values.branches;
  }

  public conditionals(): number {
    return this.values.conditionals;
  }


  private emptyABCMetric(): ABCMetricData {
    return {assignments: 0, branches: 0, conditionals: 0}; 
  }
}

//type FunctionQualityMetric = Map<string, ABCMetric>;

class CodeQualityAnalyzer {
  private projectPath: string;

  constructor(path: string) {
      this.projectPath = path;
  }

  public run() {
      const sources = recursivelyGetTypescriptSources(this.projectPath);
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

  private analyzeFunctionNode(nodeBody: any): ABCMetric {
    let rollingMetric = new ABCMetric();

    if (!nodeBody) {
        return rollingMetric;
    }

    let nodeQueue: any[] = [nodeBody];
    while (nodeQueue.length > 0) {
      const node = nodeQueue.shift();
      const visitor = createVisitorFrom(node);

      if (visitor) {
        rollingMetric.combineWith( visitor.visit() );
      }
      //console.log(node);
      //console.log('------------------------------');
    }

    return rollingMetric;
  }

  // Returns ABC metrics for each discovered function
  private analyzeSingleSource(source: string): Map<string, ABCMetric> {
    console.log(`Analyzing source '${source}'...`);

    const code = fs.readFileSync(`${this.projectPath}/${source}`).toString();
    const ast = this.getSourceFileAST(code);
    const functions = this.discoverFunctionsFromAST(ast);

    // abcMetrices: Map<string, number[]> -> key is the function name, value is 
    const abcMetrices: Map<string, ABCMetric> = new Map<string, ABCMetric>();
    //for (const fn of functions) {
      const fn = functions[0];
        if (fn.type === "MethodDefinition") {
            const fnName = fn.key.name;
            console.log(`Analyzing function ${fnName}`);
            abcMetrices.set(fnName, this.analyzeFunctionNode(fn.value.body));
        } else if (fn.type === "FunctionDeclaration") {
            const fnName = fn.id.name;
            console.log(`Analyzing function ${fnName}`);
            abcMetrices.set(fnName, this.analyzeFunctionNode(fn.body));
        }
    //}

    return abcMetrices;
  }
};

export function analyzeCodeQuality(path: string) {
    console.log(`Analyzing code quality of project '${path}'`);

    const analyzer = new CodeQualityAnalyzer(path);
    analyzer.run();
}