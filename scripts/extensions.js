import ts from 'typescript';
import {dirname, join, extname} from 'node:path';
import {accessSync} from 'node:fs';

const transformer = (_) => (ctx) => (sourceFile) => {
    function visitNode(node) {
        if (shouldMutateModuleSpecifier(node)) {
            const root = dirname(node.parent.resolvedPath);
            const file = access(root, node.moduleSpecifier.text);
            const path = ctx.factory.createStringLiteral(file);

            if (ts.isImportDeclaration(node)) {
                node = ctx.factory.updateImportDeclaration(node, node.modifiers, node.importClause, path, node.assertClause);
            } else if (ts.isExportDeclaration(node)) {
                node = ctx.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, path, node.assertClause);
            }
        }

        return ts.visitEachChild(node, visitNode, ctx)
    }

    function access(root, path) {
        for (const variant of [path + '.ts', path + '.js', path + '/index.ts', path + '/index.js']) {
            try {
                accessSync(join(root, variant));
                return variant.replace(/\.ts$/, '.js');
            } catch {}
        }

        return path;
    }

    function shouldMutateModuleSpecifier(node) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return false
        if (node.moduleSpecifier === undefined) return false
        // only when module specifier is valid
        if (!ts.isStringLiteral(node.moduleSpecifier)) return false
        // only when path is relative
        if (!node.moduleSpecifier.text.startsWith('./') && !node.moduleSpecifier.text.startsWith('../')) return false
        // only when module specifier has no extension
        if (extname(node.moduleSpecifier.text) !== '') return false
        return true
    }

    return ts.visitNode(sourceFile, visitNode)
}

export default transformer;