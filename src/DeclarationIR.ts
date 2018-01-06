"use strict";

import { Set, List, OrderedSet } from "immutable";
import stringHash = require("string-hash");

import { TypeGraph } from "./TypeGraph";
import { Type } from "./Type";
import { panic } from "./Support";

export type DeclarationKind = "forward" | "define";

export class Declaration {
    constructor(readonly kind: DeclarationKind, readonly type: Type) {}

    equals(other: any): boolean {
        if (!(other instanceof Declaration)) return false;
        return this.kind === other.kind && this.type.equals(other.type);
    }

    hashCode(): number {
        return (stringHash(this.kind) + this.type.hashCode()) | 0;
    }
}

export class DeclarationIR {
    constructor(readonly declarations: List<Declaration>, readonly forwardedTypes: Set<Type>) {}
}

function findBreaker(t: Type, path: List<Type>, canBreak: ((t: Type) => boolean) | undefined): Type | undefined {
    const index = path.indexOf(t);
    if (index < 0) return undefined;
    if (canBreak === undefined) {
        return path.get(index);
    }
    const potentialBreakers = path.take(index + 1).reverse();
    const maybeBreaker = potentialBreakers.find(canBreak);
    if (maybeBreaker === undefined) {
        return panic("Found a cycle that cannot be broken");
    }
    return maybeBreaker;
}

export function declarationsForGraph(
    graph: TypeGraph,
    canBeForwardDeclared: ((t: Type) => boolean) | undefined,
    childrenOfType: (t: Type) => OrderedSet<Type>,
    needsDeclaration: (t: Type) => boolean
): DeclarationIR {
    const needsForwardDeclarations = canBeForwardDeclared !== undefined;
    let visitedTypes: Set<Type> = Set();
    let forwardedTypes: Set<Type> = Set();
    const declarations: Declaration[] = [];

    function visit(t: Type, path: List<Type>): void {
        if (visitedTypes.has(t)) return;

        const maybeForward = findBreaker(t, path, canBeForwardDeclared);
        if (maybeForward !== undefined) {
            if (needsForwardDeclarations) {
                declarations.push(new Declaration("forward", maybeForward));
                forwardedTypes = forwardedTypes.add(maybeForward);
            }
            return;
        }

        const pathForChildren = path.unshift(t);
        childrenOfType(t).forEach(c => visit(c, pathForChildren));

        if (visitedTypes.has(t)) return;
        if (forwardedTypes.has(t) || needsDeclaration(t)) {
            declarations.push(new Declaration("define", t));
            visitedTypes = visitedTypes.add(t);
        }
    }

    let topLevels = graph.topLevels;
    if (needsForwardDeclarations) {
        topLevels = topLevels.reverse();
    }

    topLevels.forEach(t => visit(t, List()));

    let declarationsList = List(declarations);
    if (!needsForwardDeclarations) {
        declarationsList = declarationsList.reverse();
    }

    return new DeclarationIR(declarationsList, forwardedTypes);
}

export function cycleBreakerTypesForGraph(
    graph: TypeGraph,
    isImplicitCycleBreaker: (t: Type) => boolean,
    canBreakCycles: (t: Type) => boolean
): Set<Type> {
    let visitedTypes = Set();
    let cycleBreakerTypes: Set<Type> = Set();
    const queue: Type[] = graph.topLevels.valueSeq().toArray();

    function visit(t: Type, path: List<Type>): void {
        if (visitedTypes.has(t)) return;

        if (isImplicitCycleBreaker(t)) {
            queue.push(...t.children.toArray());
        } else {
            const maybeBreaker = findBreaker(t, path, canBreakCycles);
            if (maybeBreaker !== undefined) {
                cycleBreakerTypes = cycleBreakerTypes.add(maybeBreaker);
                return;
            }

            const pathForChildren = path.unshift(t);
            t.children.forEach(c => visit(c, pathForChildren));
        }

        visitedTypes = visitedTypes.add(t);
    }

    for (;;) {
        const maybeType = queue.pop();
        if (maybeType === undefined) break;
        visit(maybeType, List());
    }

    return cycleBreakerTypes;
}
