declare var plugin: import("plugin").NCMInjectPlugin;
declare const React: typeof import("react");
declare var h: typeof React.createElement;
declare var f: typeof React.Fragment;
declare const ReactDOM: typeof import("react-dom");
declare const betterncm: typeof import("betterncm-api/index").default;

declare module "plugin" {
    export interface InjectFile {
        file: string;
    }
    export interface PluginManifest {
        manifest_version: number;
        name: string;
        version: string;
        injects: {
            [pageType: string]: InjectFile;
        };
    }
    export class NCMInjectPlugin extends EventTarget {
        readonly filePath: string;
        pluginPath: string;
        manifest: PluginManifest;
        configViewElement: HTMLElement | null;
        mainPlugin: any;
        loadError: Error | null;
        finished: boolean;
        onLoad(fn: (selfPlugin: NCMInjectPlugin) => void): void;
        onConfig(fn: (toolsBox: any) => HTMLElement): void;
        onAllPluginsLoaded(fn: (loadedPlugins: any) => void): void;
        getConfig<T>(key: string, defaultValue: T): T;
        setConfig<T>(key: string, value: T): void;
    }
}

declare module "betterncm-api/index" {
    const BetterNCM: {
        utils: {
            waitForElement(selector: string, interval?: number): Promise<Element | null>;
        };
    };
    export default BetterNCM;
}
