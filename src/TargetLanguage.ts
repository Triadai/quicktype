"use strict";

import { TypeGraph } from "./TypeGraph";
import { Renderer } from "./Renderer";
import { OptionDefinition, Option } from "./RendererOptions";
import { serializeRenderResult, SerializedRenderResult } from "./Source";
import { StringTypeMapping } from "./TypeBuilder";
import { assert, panic } from "./Support";
import { ConvenienceRenderer } from "./ConvenienceRenderer";

export abstract class TargetLanguage {
    private _options?: Option<any>[];

    constructor(readonly displayName: string, readonly names: string[], readonly extension: string) {}

    protected setOptions = (options: Option<any>[]): void => {
        assert(this._options === undefined, `Target language ${this.displayName} sets its options more than once`);
        this._options = options;
    };

    get optionDefinitions(): OptionDefinition[] {
        if (this._options === undefined) {
            return panic(`Target language ${this.displayName} did not set its options`);
        }
        return this._options.map(o => o.definition);
    }

    protected abstract get rendererClass(): new (
        graph: TypeGraph,
        leadingComments: string[] | undefined,
        ...optionValues: any[]
    ) => Renderer;

    renderGraphAndSerialize(
        graph: TypeGraph,
        alphabetizeProperties: boolean,
        leadingComments: string[] | undefined,
        rendererOptions: { [name: string]: any },
        indentation?: string
    ): SerializedRenderResult {
        if (this._options === undefined) {
            return panic(`Target language ${this.displayName} did not set its options`);
        }
        if (indentation === undefined) {
            indentation = this.defaultIndentation;
        }
        const renderer = new this.rendererClass(
            graph,
            leadingComments,
            ...this._options.map(o => o.getValue(rendererOptions))
        );
        if ((renderer as any).setAlphabetizeProperties !== undefined) {
            (renderer as ConvenienceRenderer).setAlphabetizeProperties(alphabetizeProperties);
        }
        const renderResult = renderer.render();
        return serializeRenderResult(renderResult, indentation);
    }

    protected get defaultIndentation(): string {
        return "    ";
    }

    protected get partialStringTypeMapping(): Partial<StringTypeMapping> {
        return {};
    }

    get stringTypeMapping(): StringTypeMapping {
        const partial = this.partialStringTypeMapping;
        return {
            date: partial.date || "string",
            time: partial.time || "string",
            dateTime: partial.dateTime || "string"
        };
    }
}
