import { analyze } from 'escope'
import { Program } from 'esprima'
import { keyword } from 'esutils'
import { traverse, Syntax } from 'estraverse'
import { strict } from 'assert'
import words from './dict'

let wordsCache: Array<number>

type UnmangleOptions = {
  destructive?: boolean
  shouldRename?: Function,
  renamePrefix?: string
}

const getRandomIndex = (size: number): number => {
  return Math.floor(Math.random() * size)
}

function generateNextName (name?: any): any {
  if (name && name.length > 2) {
    return name
  }
  let index: number = getRandomIndex(words.length - 1)
  if (!wordsCache) {
    wordsCache = [index]
  } else {
    let i = 1
    while (wordsCache.indexOf(index) >= 0) {
      if (i === words.length - 1) {
        wordsCache = [index]
      }
      index = getRandomIndex(words.length - 1)
      i++
    }
  }
  return words[index]
}

class NameGenerator {
  _scope: any;
  _functionName: string;

  constructor (scope: any, options: any) {
    this._scope = scope
    this._functionName = ''
    if (!options.distinguishFunctionExpressionScope &&
        this._scope.upper &&
        this._scope.upper.functionExpressionScope) {
      this._functionName = this._scope.upper.block.id.name
    }
  }

  passAsUnique (name: any) {
    if (this._functionName === name) {
      return false
    }
    if (keyword.isKeywordES5(name, true) || keyword.isRestrictedWord(name)) {
      return false
    }
    if (this._scope.taints.has(name)) {
      return false
    }
    for (const through of this._scope.through) {
      if (through.identifier.name === name) {
        return false
      }
    }
    return true
  }

  generateName (tip: any, prefix: any, currentName: any) {
    if (!prefix) {
      prefix = ''
    }
    do {
      tip = generateNextName(currentName)
    } while (!this.passAsUnique(prefix + tip))
    return prefix + tip
  }
}

function run (scope: any, options: any): any {
  const generator = new NameGenerator(scope, options)
  const prefix = options.renamePrefix

  const shouldRename = (options && options.shouldRename) || function () { return true }

  if (scope.isStatic()) {
    let name = '9'

    scope.variables.sort((a: any, b: any) => {
      if (a.tainted) {
        return 1
      }
      if (b.tainted) {
        return -1
      }
      return (b.identifiers.length + b.references.length) - (a.identifiers.length + a.references.length)
    })

    for (const variable of scope.variables) {
      if (variable.tainted) {
        continue
      }

      if (variable.identifiers.length === 0) {
        continue
      }

      name = generator.generateName(name, prefix, variable.name)

      for (const def of variable.identifiers) {
        if (shouldRename(def.name)) {
          def.name = name
        }
      }

      for (const ref of variable.references) {
        if (shouldRename(ref.identifier.name)) {
          ref.identifier.name = name
        }
      }
    }
  }
}

class Label {
  node: any;
  upper: any;
  users: Array<any>;
  names: Map<string, any>;
  name: any;

  constructor (node: any, upper: any) {
    this.node = node
    this.upper = upper
    this.users = []
    this.names = new Map()
    this.name = null
  }

  unmangle () {
    let tip = '9'

    // merge already used names
    for (let current = this.upper; current; current = current.upper) {
      if (current.name !== null) {
        this.names.set(current.name, true)
      }
    }

    do {
      tip = generateNextName()
    } while (this.names.has(tip))

    this.name = tip

    for (let current = this.upper; current; current = current.upper) {
      current.names.set(tip, true)
    }

    this.node.label.name = tip
    // eslint-disable-next-line no-return-assign
    this.users.forEach((user: any) => user.label.name = tip)
  }
}

class LabelScope {
  map: Map<string, any>;
  upper: any;
  label: any;
  labels: Array<any>;

  constructor (upper: any) {
    this.map = new Map()
    this.upper = upper
    this.label = null
    this.labels = []
  }

  register (node: any) {
    strict(node.type === Syntax.LabeledStatement, 'node should be LabeledStatement')

    this.label = new Label(node, this.label)
    this.labels.push(this.label)

    const name = node.label.name
    strict(!this.map.has(name), 'duplicate label is found')
    this.map.set(name, this.label)
  }

  unregister (node: any) {
    if (node.type !== Syntax.LabeledStatement) {
      return
    }

    const name = node.label.name
    const ref = this.map.get(name)
    this.map.delete(name)

    this.label = ref.upper
  }

  resolve (node: any) {
    if (node.label) {
      const name = node.label.name
      strict(this.map.has(name), 'unresolved label')
      this.map.get(name).users.push(node)
    }
  }

  close () {
    this.labels.sort((lhs, rhs) => rhs.users.length - lhs.users.length)

    this.labels.forEach(label => label.mangle())

    return this.upper
  }
}

function unmangleLabels (tree: Program): any {
  let labelScope: any
  const FuncOrProgram = [Syntax.Program, Syntax.FunctionExpression, Syntax.FunctionDeclaration]
  traverse(tree, {
    enter: node => {
      if (FuncOrProgram.indexOf(node.type as any) >= 0) {
        labelScope = new LabelScope(labelScope)
        return
      }

      switch (node.type) {
        case Syntax.LabeledStatement:
          labelScope.register(node)
          break

        case Syntax.BreakStatement:
        case Syntax.ContinueStatement:
          labelScope.resolve(node)
          break
      }
    },
    leave: node => {
      labelScope.unregister(node)
      if (FuncOrProgram.indexOf(node.type as any) >= 0) {
        labelScope = labelScope.close()
      }
    }
  })

  return tree
}

export function unmangle (tree: Program, options?: UnmangleOptions): any {
  options = options || { destructive: true }
  const { destructive } = options
  const ast = destructive ? tree : JSON.parse(JSON.stringify(tree))
  const manager = analyze(ast, { directive: true })

  // unmangling names
  manager.scopes.forEach((scope: any) => run(scope, options))

  // unmangling labels
  return unmangleLabels(ast)
}

export default unmangle
