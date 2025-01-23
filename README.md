# lwc-signals-plugin

[![NPM](https://img.shields.io/npm/v/lwc-signals-plugin.svg?label=lwc-signals-plugin)](https://www.npmjs.com/package/lwc-signals-plugin) [![Downloads/week](https://img.shields.io/npm/dw/lwc-signals-plugin.svg)](https://npmjs.org/package/lwc-signals-plugin) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/salesforcecli/lwc-signals-plugin/main/LICENSE.txt)

This is an experimental plugin that allows users of the LWC Signals library to use the bind decorator
in their components

## Reasoning

LWC does not currently support custom Javascript decorators. They do support the standard wire, api, and track
decorators, but do not allow developers to create their own custom ones.

Nonetheless, decorators are an elegant and powerful tool, and we saw the need for then in the LWC Signals library.

## Install

```bash
sf plugins install lwc-signals-plugin
```

## Usage

This plugins has no commands. If your code has the `@bind` decorator, the plugin will automatically
transform your code into a format that LWC can push it to your org, and then transform it back to the original
code after the push.

There's nothing for you to do on your side besides installing the plugin.
