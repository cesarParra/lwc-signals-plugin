import path from 'node:path';
import fs from 'node:fs';
import * as babel from '@babel/core';

import { Lifecycle } from '@salesforce/core';
import { BabelFileResult } from '@babel/core';
import SyntaxDecorator from '@babel/plugin-syntax-decorators';

const hook = (): void => {
  const lifecycleInstance = Lifecycle.getInstance();
  lifecycleInstance.on('scopedPreDeploy', onPreDeploy);
  lifecycleInstance.on('scopedPostDeploy', restore);
};

type PreDeployed = {
  fileLocation: string;
  contentsBeforeDeployment: string;
};

type PreDeployComponents = {
  componentSet: ComponentSet;
};

type ComponentSet = {
  getSourceComponents(): ComponentCollection;
};

type ComponentCollection = {
  toArray(): Component[];
};

type Component = {
  type: {
    name: string;
  };
  content: string;
  name: string;
};

const predeployedList: PreDeployed[] = [];

type BabelFileMetadata = {
  seen: boolean;
};

function onPreDeploy(data: PreDeployComponents): Promise<void> {
  return new Promise((resolve) => {
    const components = data.componentSet.getSourceComponents().toArray();
    for (const component of components) {
      if (component.type.name === 'LightningComponentBundle') {
        const jsLocation = path.join(component.content, `${component.name}.js`);
        const fileContents = fs.readFileSync(jsLocation, 'utf8');
        const transformedFile = transformFile(fileContents);
        if (transformedFile?.code && (transformedFile?.metadata as unknown as BabelFileMetadata | null)?.seen) {
          fs.writeFileSync(jsLocation, transformedFile.code);
          predeployedList.push({
            fileLocation: jsLocation,
            contentsBeforeDeployment: fileContents,
          });
        }
      }
    }
    resolve();
  });
}

function restore(): Promise<void> {
  return new Promise((resolve) => {
    predeployedList.forEach((predeployed: PreDeployed) => {
      fs.writeFileSync(predeployed.fileLocation, predeployed.contentsBeforeDeployment);
    });
    resolve();
  });
}

function transformFile(fileContents: string): BabelFileResult | null {
  return babel.transformSync(fileContents, {
    plugins: [[SyntaxDecorator, { version: '2023-11' }], [replaceBindDecorator]],
  });
}

const BIND_DECORATOR = 'bind';

type Types = {
  importDeclaration: (specifiers: any, source: any) => any;
  importSpecifier: (local: any, imported: any) => any;
  identifier: (name: string) => any;
  stringLiteral: (value: string) => any;
};

type Path = {
  parent: {
    key: {
      name: string;
    };
  };
  traverse: (visitor: any) => void;
  remove: () => void;
  parentPath: {
    replaceWithSourceString: (code: string) => void;
  };
  node: {
    source: {
      value: string;
    };
    specifiers: Array<{
      imported: {
        name: string;
      };
    }>;
    expression: {
      callee: {
        name: string;
      };
      arguments: Array<{
        name: string;
      }>;
    };
    body: {
      unshift: (importDeclaration: any) => void;
    };
  };
};

type State = {
  file: {
    metadata: BabelFileMetadata;
  };
};

function replaceBindDecorator({ types: t }: { types: Types }) {
  return {
    visitor: {
      Program(path: Path) {
        let hasBindImport = false;
        let hasBindDecorator = false;

        path.traverse({
          ImportDeclaration(importPath: Path) {
            if (importPath.node.source.value === 'c/signals') {
              importPath.node.specifiers.forEach((specifier) => {
                if (specifier.imported && specifier.imported.name === BIND_DECORATOR) {
                  hasBindImport = true;
                }
              });
            }
          },
          Decorator(decoratorPath: Path) {
            if (decoratorPath.node.expression.callee.name === BIND_DECORATOR) {
              hasBindDecorator = true;
            }
          },
        });

        if (hasBindDecorator && !hasBindImport) {
          const importDeclaration: unknown = t.importDeclaration(
            [t.importSpecifier(t.identifier(BIND_DECORATOR), t.identifier(BIND_DECORATOR))],
            t.stringLiteral('c/signals')
          );
          path.node.body.unshift(importDeclaration);
        }
      },
      ClassDeclaration(path: Path, state: State) {
        path.traverse({
          Decorator(path: Path) {
            if (path.node.expression.callee.name !== BIND_DECORATOR) {
              return;
            }

            const propertyName = path.parent.key.name;
            const decoratorArguments = path.node.expression.arguments;
            // Throw if there is more than one argument
            if (decoratorArguments.length !== 1) {
              throw new Error('Expected exactly one argument');
            }
            const decoratorArgumentName = decoratorArguments[0].name;

            // Remove this decorator
            path.remove();
            // and replace the property code with the new one
            path.parentPath.replaceWithSourceString(replacementCode(propertyName, decoratorArgumentName));
            state.file.metadata.seen = true;
          },
        });
      },
    },
  };
}

function replacementCode(propertyName: string, decoratorArgument: string) {
  return `${propertyName} = bind(this, "${propertyName}").to(${decoratorArgument})`;
}

export default hook;
