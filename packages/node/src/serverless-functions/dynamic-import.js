exports.dyanmicImport = filepath => import(filepath).then(mod => mod.default);
