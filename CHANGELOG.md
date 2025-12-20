# Changelog

## [1.1.0](https://github.com/ojson-platform/models/compare/models-v1.0.0...models-v1.1.0) (2025-12-20)


### Features

* **utils:** add has() utility for property and type checking ([966bc43](https://github.com/ojson-platform/models/commit/966bc43899a38c3277028920dd755e8eb1fad478))


### Bug Fixes

* **ci:** enable publish workflow trigger for release-please releases ([5528230](https://github.com/ojson-platform/models/commit/5528230948d26d03b7494a3d7e6dd1d36aa05bfc))
* **ci:** fix integration tests not found in examples workflow ([febefe8](https://github.com/ojson-platform/models/commit/febefe8f7f6e87bcd9292a2c49a08f92d4e305be))
* **coverage:** limit coverage calculation to src/ directory only ([a89cac1](https://github.com/ojson-platform/models/commit/a89cac17c291d91666535ec4df685582111b80a8))
* **lint:** disable no-explicit-any for spec files ([40aaa30](https://github.com/ojson-platform/models/commit/40aaa306f9dc74525aa0402a9f295a97a188838f))
* **lint:** replace any with proper types to eliminate warnings ([fdac41f](https://github.com/ojson-platform/models/commit/fdac41f670312b54817aafa7ac35a50bde0ccc23))

## [1.0.0](https://github.com/ojson-platform/models/compare/models-v0.0.1...models-v1.0.0) (2025-12-20)


### Features

* add SonarCloud integration for code quality and coverage ([52902ab](https://github.com/ojson-platform/models/commit/52902ab1c4d0c7a9a558b7ed4399e3653139c6fd))
* **ci:** add release-please and npm publish workflow ([6fd83cf](https://github.com/ojson-platform/models/commit/6fd83cffc96a3c64325c9edfaaf91ef802eef8c8))
* **ci:** add security scanning with npm audit and Dependabot ([e91fbb5](https://github.com/ojson-platform/models/commit/e91fbb564bfcd47b6f5dde3d9764fc9f257b404d))
* **ci:** configure Dependabot for automatic dependency updates ([8913be9](https://github.com/ojson-platform/models/commit/8913be986b279e7d0aa11bbb617ad0256172fc6e))
* **release:** configure release-please for custom commit types and 1.0.0 release ([f0d4380](https://github.com/ojson-platform/models/commit/f0d4380c8325338aa279dd021783baaa82980281))
* setup dev infrastructure with ESLint, Prettier, and CI ([ccde18c](https://github.com/ojson-platform/models/commit/ccde18cf0fdb070f519dc9ddc17b6549e76e44e2))


### Bug Fixes

* **ci:** add checkout step to release-please workflow ([f0814ac](https://github.com/ojson-platform/models/commit/f0814acdeb96e2f6a181fc60bd2ab2078a74e796))
* **ci:** add release-please manifest file ([0824031](https://github.com/ojson-platform/models/commit/0824031d97536d64b0f15fecd1f18166a6db3a5b))
* **ci:** add required sonar.organization parameter ([343128e](https://github.com/ojson-platform/models/commit/343128e568537eb685747a248ae2b6bd8cdbdedf))
* **ci:** add type tests to pre-commit hook ([9a5292a](https://github.com/ojson-platform/models/commit/9a5292a584fd6a577a4dbce81835050b9d9d8d1d))
* **ci:** exclude examples directory from SonarCloud analysis ([58b6f00](https://github.com/ojson-platform/models/commit/58b6f002cc697a010c95a4b187c02ade4c2b35b6))
* **ci:** use correct version tag v5.0.0 for SonarCloud action ([da8f81d](https://github.com/ojson-platform/models/commit/da8f81d291253d9c454efaa6a6d494cd74cd97a2))
* **ci:** use specific version tag for SonarCloud action instead of [@master](https://github.com/master) ([441da6e](https://github.com/ojson-platform/models/commit/441da6e02ec191748d01d7b489accc601e879392))
* resolve critical and major SonarCloud issues ([c7c0c04](https://github.com/ojson-platform/models/commit/c7c0c04f9518735af80ae81c3c213cd01ef9050b))
* resolve ESLint errors reported by SonarCloud ([04480cf](https://github.com/ojson-platform/models/commit/04480cfe7783b628840dfb08501dff2660b19830))
* resolve TypeScript errors after Cognitive Complexity refactoring ([b9f8bb4](https://github.com/ojson-platform/models/commit/b9f8bb41e025dd0777dc07a0a3926971ba399ff4))
