import { unmangle } from '../src'
import { parseScript } from 'esprima'
import * as test from 'tape'

test('basic functionality: does not touch top-level variable declarations', (t) => {
  const ast = parseScript('var foo, bar, baz;')
  const result = unmangle(ast)
  t.equal(result.body[0].declarations[0].id.name, 'foo')
  t.equal(result.body[0].declarations[1].id.name, 'bar')
  t.equal(result.body[0].declarations[2].id.name, 'baz')
  t.end()
})

test('basic functionality: unshortens local variable declarations', (t) => {
  const ast = parseScript('function f() { var a, b, c; }')
  const result = unmangle(ast)
  const statements = result.body[0].body.body
  t.assert(statements[0].declarations[0].id.name.length > 1)
  t.assert(statements[0].declarations[1].id.name.length > 1)
  t.assert(statements[0].declarations[2].id.name.length > 1)
  t.end()
})

test('basic functionality: unshortens parameter names', (t) => {
  const ast = parseScript('function f(a, b, c) { a = 1; b = 2; c = 3; }')
  const result = unmangle(ast)
  const params = result.body[0].params
  t.assert(params[0].name.length > 1)
  t.assert(params[1].name.length > 1)
  t.assert(params[2].name.length > 1)
  const statements = result.body[0].body.body
  t.assert(statements[0].expression.left.name.length > 1)
  t.assert(statements[1].expression.left.name.length > 1)
  t.assert(statements[2].expression.left.name.length > 1)
  t.end()
})

test('basic functionality: does not mangle implicit globals', (t) => {
  const ast = parseScript('function f(a) { foo = 1; a = 2; baz = 3; }')
  const result = unmangle(ast)
  t.assert(result.body[0].params[0].name.length > 1)
  const statements = result.body[0].body.body
  t.equal(statements[0].expression.left.name, 'foo')
  t.assert(statements[1].expression.left.name.length > 1)
  t.equal(statements[2].expression.left.name, 'baz')
  t.end()
})

test('basic functionality: does not overwrite existing identifiers', (t) => {
  const ast = parseScript('function f(foo) { function a(b) { c; } }')
  const result = unmangle(ast)
  const f = result.body[0]
  const a = result.body[0].body.body[0]
  t.notEqual(f.params[0].name, a.id.name)
  t.notEqual(f.params[0].name, a.body.body[0].expression.name)
  t.notEqual(a.id.name, a.body.body[0].expression.name)
  t.end()
})

test('nested scope handling: unshortens nested function names', (t) => {
  const ast = parseScript('function f() { function g() {} }')
  const result = unmangle(ast)
  t.equal(result.body[0].id.name, 'f')
  t.assert(result.body[0].body.body[0].id.name.length > 1)
  t.end()
})

test('nested scope handling: unshortens parameters in nested functions', (t) => {
  const ast = parseScript('function f(a) { function g(a) { a; } }')
  const result = unmangle(ast)
  t.assert(result.body[0].params[0].name.length > 1)
  const g = result.body[0].body.body[0]
  t.assert(g.id.name.length > 1)
  t.assert(g.params[0].name.length > 1)
  t.assert(g.body.body[0].expression.name.length > 1)
  t.end()
})

test('nested scope handling: unshortens variable names in nested functions', (t) => {
  const ast = parseScript('function f(a) { var b = 1; var z = function i(a) { a; var q; } }')
  const result = unmangle(ast)
  const f = result.body[0]
  t.equal(f.id.name, 'f')
  t.assert(f.params[0].name.length > 1)
  const statements = f.body.body
  t.assert(statements[0].declarations[0].id.name.length > 1)
  t.assert(statements[1].declarations[0].id.name.length > 1)
  const inner = statements[1].declarations[0].init
  t.assert(inner.id.name.length > 1)
  t.assert(inner.params[0].name.length > 1)
  const innerStatements = inner.body.body
  t.assert(innerStatements[0].expression.name.length > 1)
  t.assert(innerStatements[1].declarations[0].id.name.length > 1)
  t.end()
})

test('`destructive` option: defaults to `true`', (t) => {
  const ast = parseScript('function f() { var a, b, c; }')
  const result = unmangle(ast)
  t.equal(result, ast)
  t.end()
})

test('`destructive` option: accepts `true`', (t) => {
  const ast = parseScript('function f() { var a, b, c; }')
  const result = unmangle(ast, { destructive: true })
  t.equal(result, ast)
  t.end()
})

test('`destructive` option: accepts `false`', (t) => {
  const ast = parseScript('function f() { var a, b, c; }')
  const json = JSON.stringify(ast)

  const result = unmangle(ast, { destructive: false })
  t.notEqual(result, ast)
  t.equal(JSON.stringify(ast), json)
  t.end()
})

test('`shouldRename` option: renames by default', (t) => {
  const ast = parseScript('(function a() { var x, y, z; });')
  const result = unmangle(ast)
  t.assert(result.body[0].expression.id.name.length > 1)
  t.end()
})

test('`shouldRename` option: renames if it returns `true`', (t) => {
  const ast = parseScript('(function a() { var x, y, z; });')
  const result = unmangle(ast, { shouldRename: function (id: any) { return id === 'a' } })
  t.assert(result.body[0].expression.id.name.length > 1)
  t.end()
})

test('`shouldRename` option: does not rename if it returns `false`', (t) => {
  const ast = parseScript('(function a() { var x, y, z; });')
  const result = unmangle(ast, { shouldRename: function (id: any) { return id !== 'a' } })
  t.equal(result.body[0].expression.id.name, 'a')
  t.end()
})

test('`renamePrefix` option: prefixes identifier with the given value', (t) => {
  const ast = parseScript('(function a() { var i = 42; });')
  const result = unmangle(ast, { renamePrefix: 'foo_' })
  t.equal(result.body[0].expression.id.name.indexOf('foo_'), 0)
  t.end()
})
