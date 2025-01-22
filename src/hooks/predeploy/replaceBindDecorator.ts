// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import path from 'node:path';
import fs from 'node:fs';
import * as babel from '@babel/core';

import {Lifecycle} from '@salesforce/core';
import {BabelFileResult} from '@babel/core';
import SyntaxDecorator from '@babel/plugin-syntax-decorators';
// import {type ScopedPreDeploy} from '@salesforce/source-deploy-retrieve';

// eslint-disable-next-line @typescript-eslint/require-await
const hook = (): void => {
  const lifecycleInstance = Lifecycle.getInstance();
  lifecycleInstance.on('scopedPreDeploy', logPredeployData);
  lifecycleInstance.on('scopedPostDeploy', restore);
};

type Predeployed = {
  fileLocation: string;
  contentsBeforeDeployment: string;
}

const predeployedList = [];

function logPredeployData(data): Promise<void> {
  return new Promise((resolve) => {
    const components = data.componentSet.getSourceComponents().toArray();
    components.forEach((component) => {
      if (component.type.name === 'LightningComponentBundle') {
        const jsLocation = path.join(component.content, `${component.name}.js`);
        const fileContents = fs.readFileSync(jsLocation, 'utf8');
        const transformedFile = transformFile(fileContents);
        if (transformedFile?.metadata.seen) {
          fs.writeFileSync(jsLocation, transformedFile.code);
          predeployedList.push({
            fileLocation: jsLocation,
            contentsBeforeDeployment: fileContents
          });
        }
      }
    });
    resolve();
  });
}

function restore(): Promise<void> {
  return new Promise((resolve) => {
    predeployedList.forEach((predeployed: Predeployed) => {
      fs.writeFileSync(predeployed.fileLocation, predeployed.contentsBeforeDeployment);
    });
    resolve();
  });
}

function transformFile(fileContents: string): BabelFileResult | null {
  return babel.transformSync(fileContents, {
    'plugins': [
      [SyntaxDecorator, {'version': '2023-11'}],
      [testPlugin]
    ],
  });
}

function testPlugin({types: t}): void {
  return {
    visitor: {
      Program(path) {
        let hasBindImport = false;
        let hasBindDecorator = false;

        path.traverse({
          ImportDeclaration(importPath) {
            if (importPath.node.source.value === 'c/signals') {
              importPath.node.specifiers.forEach(specifier => {
                if (specifier.imported && specifier.imported.name === '$bind') {
                  hasBindImport = true;
                }
              });
            }
          },
          Decorator(decoratorPath) {
            if (decoratorPath.node.expression.callee.name === 'bind') {
              hasBindDecorator = true;
            }
          }
        });

        if (hasBindDecorator && !hasBindImport) {
          const importDeclaration = t.importDeclaration(
            [t.importSpecifier(t.identifier('$bind'), t.identifier('$bind'))],
            t.stringLiteral('c/signals')
          );
          path.node.body.unshift(importDeclaration);
        }
      },
      ClassDeclaration(path, state) {
        path.traverse({
          Decorator(path) {
            if (path.node.expression.callee.name !== 'bind') {
              return;
            }

            const propertyName = path.parent.key.name;
            const decoratorArguments = path.node.expression.arguments;
            // Throw if there is more than one argument
            if (decoratorArguments.length !== 1) {
              throw new Error("Expected exactly one argument");
            }
            const decoratorArgumentName = decoratorArguments[0].name;

            // Remove this decorator
            path.remove();
            // and replace the property code with the new one
            path.parentPath.replaceWithSourceString(replacementCode(propertyName, decoratorArgumentName));
            state.file.metadata.seen = true;
          }
        })
      }
    }
  }
}

function replacementCode(propertyName, decoratorArgument) {
  return `${propertyName} = bind(this, "${propertyName}").to(${decoratorArgument})`;
}

export default hook;
