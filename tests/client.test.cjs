const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const clientSource = fs.readFileSync(
  path.join(__dirname, "..", "Client.js"),
  "utf8"
);
const htmlSource = fs.readFileSync(
  path.join(__dirname, "..", "index.html"),
  "utf8"
);
const stylesSource = fs.readFileSync(
  path.join(__dirname, "..", "Styles.css"),
  "utf8"
);
const STORAGE_KEY = "amigoSecretoGrupos";

class Element {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.width = 720;
    this.height = 720;
    this.canvasCalls = { clips: 0, fillText: [], rotations: [] };
    this.className = "";
    this.classList = {
      add: className => {
        this.className = [...new Set([...this.className.split(/\s+/), className])]
          .filter(Boolean)
          .join(" ");
      },
      remove: className => {
        this.className = this.className
          .split(/\s+/)
          .filter(existing => existing !== className)
          .join(" ");
      },
      contains: className => this.className.split(/\s+/).includes(className),
    };
    this._innerHTML = "";
    this.textContent = "";
    this.parentElement = null;
    this.files = [];
    this.title = "";
    this.context2d = {
      clearRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      stroke() {},
      moveTo() {},
      closePath() {},
      clip: () => {
        this.canvasCalls.clips += 1;
      },
      save() {},
      translate() {},
      rotate: angle => this.canvasCalls.rotations.push(angle),
      measureText: text => ({ width: String(text).length * 6 }),
      fillText: (text, x, y, maxWidth) =>
        this.canvasCalls.fillText.push({ text, x, y, maxWidth }),
      restore() {},
    };
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  append(...elements) {
    elements.forEach(element => {
      element.parentElement = this;
    });
    this.children.push(...elements);
  }

  appendChild(element) {
    element.parentElement = this;
    this.children.push(element);
    return element;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(
        child => child !== this
      );
      this.parentElement = null;
    }
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  focus() {}

  select() {}

  getContext() {
    return this.context2d;
  }

  reset() {
    this.value = "";
  }

  querySelectorAll(selector) {
    const classes = selector.split(",").map(value => value.trim().replace(/^\./, ""));
    return descendants(this).filter(element =>
      classes.some(className => element.className.split(/\s+/).includes(className))
    );
  }
}

function descendants(element) {
  return element.children.flatMap(child => [child, ...descendants(child)]);
}

function createApp(savedState = null) {
  const elements = new Map();
  const storage = new Map(
    savedState ? [[STORAGE_KEY, JSON.stringify(savedState)]] : []
  );
  let ready;
  let generatedId = 0;
  let confirmCount = 0;
  const animationFrames = [];
  const timers = [];
  const readers = [];
  const images = [];
  const document = {
    body: new Element("body"),
    createElement: () => new Element(),
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, new Element(id));
      }
      return elements.get(id);
    },
    querySelectorAll(selector) {
      return Array.from(elements.values()).flatMap(element =>
        element.querySelectorAll(selector)
      );
    },
    addEventListener(type, listener) {
      if (type === "DOMContentLoaded") {
        ready = listener;
      }
    },
  };
  const localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  };
  const window = {
    confirm: () => {
      confirmCount += 1;
      return true;
    },
    location: {},
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    },
    requestAnimationFrame: callback => {
      animationFrames.push(callback);
      return animationFrames.length;
    },
  };
  const errors = [];
  const context = {
    document,
    localStorage,
    window,
    crypto: { randomUUID: () => `test-group-${++generatedId}` },
    console: { error: (...args) => errors.push(args) },
    Math,
    Date,
    Map,
    Set,
    Object,
    String,
    Number,
    JSON,
    FileReader: class {
      constructor() {
        readers.push(this);
      }

      readAsDataURL(file) {
        this.file = file;
      }
    },
    Image: class {
      constructor() {
        images.push(this);
      }
    },
  };

  vm.runInNewContext(clientSource, context, { filename: "Client.js" });
  ready();

  return {
    context,
    document,
    elements,
    storage,
    window,
    errors,
    timers,
    readers,
    images,
    get confirmCount() {
      return confirmCount;
    },
    storedState: () => JSON.parse(storage.get(STORAGE_KEY)),
    finishAnimation() {
      const firstFrame = animationFrames.shift();
      if (firstFrame) {
        firstFrame(0);
      }
      const finalFrame = animationFrames.shift();
      if (finalFrame) {
        finalFrame(6000);
      }
    },
  };
}

function addParticipant(app, name, email) {
  app.document.getElementById("participante").value = name;
  app.document.getElementById("emailParticipante").value = email;
  app.context.adicionarParticipante();
}

function confirmDraw(app) {
  const toastContainer = app.document.getElementById("toastContainer");
  const toast = toastContainer.children.find(item =>
    item.children.some(child =>
      child.children?.some(button => button.textContent === "Sortear")
    )
  );
  assert.ok(toast, "the draw confirmation toast should be visible");
  const button = toast.children[2].children.find(
    item => item.textContent === "Sortear"
  );
  button.listeners.get("click")();
}

test("places participant management in the sidebar with a scrollable list", () => {
  assert.match(
    htmlSource,
    /<aside class="sidebar"[\s\S]*<section id="cadastro">[\s\S]*<\/section>\s*<\/aside>\s*<main class="conteudo-principal">/
  );
  assert.match(stylesSource, /#listaParticipantes\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/s);
});

test("shows non-blocking toasts with distinct type, accessibility, and dismissal", () => {
  const app = createApp();
  app.context.showToast("Imagem inválida.", "warning");

  const container = app.document.getElementById("toastContainer");
  assert.equal(container.children.length, 1);
  const [toast] = container.children;
  assert.equal(toast.dataset.type, "warning");
  assert.equal(toast.attributes.role, "alert");
  assert.equal(toast.attributes["aria-live"], "assertive");
  assert.equal(toast.children[1].textContent, "Imagem inválida.");
  assert.equal(app.timers[0].delay, 4200);

  app.timers.shift().callback();
  assert.ok(toast.classList.contains("saindo"));
  app.timers.shift().callback();
  assert.equal(container.children.length, 0);
});

test("confirms group deletion through toast actions and reports success", () => {
  const app = createApp();
  app.document.getElementById("nomeGrupo").value = "Amigos";
  app.context.salvarGrupo({ preventDefault() {} });
  const idGrupo = app.storedState().grupos[1].id;
  const quantidadeAntes = app.storedState().grupos.length;
  const confirmacoesAntes = app.confirmCount;

  const botaoExcluir = app.document
    .getElementById("listaGrupos")
    .children[1].children[2];
  app.document.getElementById("listaGrupos").listeners.get("click")({
    target: { closest: () => botaoExcluir },
  });
  const toastContainer = app.document.getElementById("toastContainer");
  const toastConfirmacao = toastContainer.children[0];
  assert.equal(toastConfirmacao.dataset.type, "warning");
  assert.match(toastConfirmacao.children[1].textContent, /Amigos/);
  assert.deepEqual(
    toastConfirmacao.children[2].children.map(botao => botao.textContent),
    ["Excluir", "Cancelar"]
  );
  assert.equal(app.storedState().grupos.length, quantidadeAntes);
  assert.equal(app.confirmCount, confirmacoesAntes);

  toastConfirmacao.children[2].children[1].listeners.get("click")();
  assert.equal(app.storedState().grupos.length, quantidadeAntes);

  app.context.excluirGrupo(idGrupo);
  const confirmacaoExclusao = toastContainer.children.find(toast =>
    toast.children[1].textContent.includes("Amigos")
  );
  confirmacaoExclusao.children[2].children[0].listeners.get("click")();

  assert.equal(
    app.storedState().grupos.some(grupo => grupo.id === idGrupo),
    false
  );
  assert.equal(app.confirmCount, confirmacoesAntes);
  assert.ok(
    toastContainer.children.some(
      toast =>
        toast.dataset.type === "success" &&
        toast.children[1].textContent === "Grupo removido com sucesso!"
    )
  );
});

test("reports invalid or blocked group deletion through warning and error toasts", () => {
  const app = createApp();
  app.document.getElementById("nomeGrupo").value = "Amigos";
  app.context.salvarGrupo({ preventDefault() {} });
  const toastContainer = app.document.getElementById("toastContainer");
  const quantidadeAntes = app.storedState().grupos.length;

  app.context.excluirGrupo("grupo-inexistente");
  assert.equal(toastContainer.children[0].dataset.type, "error");
  assert.match(toastContainer.children[0].children[1].textContent, /não foi encontrado/);
  assert.equal(app.storedState().grupos.length, quantidadeAntes);

  app.context.definirAcaoEmAndamento(true);
  const idGrupo = app.storedState().grupos[0].id;
  app.context.excluirGrupo(idGrupo);
  assert.ok(
    toastContainer.children.some(
      toast =>
        toast.dataset.type === "warning" &&
        toast.children[1].textContent.includes("Aguarde")
    )
  );
  assert.equal(app.storedState().grupos.length, quantidadeAntes);
});

test("warns with a toast when the draw button is clicked without enough participants", () => {
  const app = createApp();
  const drawButton = app.document.getElementById("sortear");
  drawButton.listeners.get("click")();

  const [toast] = app.document.getElementById("toastContainer").children;
  assert.equal(toast.dataset.type, "warning");
  assert.match(toast.children[1].textContent, /pelo menos dois participantes/);
  assert.equal(app.context.getGrupoSelecionado().sorteio, null);
  assert.equal(app.confirmCount, 0);
});

test("cancels the draw through the toast without generating assignments", () => {
  const app = createApp();
  addParticipant(app, "Ana", "");
  addParticipant(app, "Bruno", "");

  app.context.iniciarSorteio();
  const toast = app.document.getElementById("toastContainer").children[0];
  assert.equal(toast.dataset.type, "warning");
  toast.children[2].children.find(button => button.textContent === "Cancelar")
    .listeners.get("click")();

  assert.equal(app.context.getGrupoSelecionado().sorteio, null);
  assert.equal(app.confirmCount, 0);
});

test("does not apply pending draw confirmation after switching groups", () => {
  const app = createApp();
  addParticipant(app, "Ana", "");
  addParticipant(app, "Bruno", "");
  app.context.iniciarSorteio();

  app.document.getElementById("nomeGrupo").value = "Outro grupo";
  app.context.salvarGrupo({ preventDefault() {} });
  confirmDraw(app);

  assert.equal(app.context.getGrupoSelecionado().sorteio, null);
  assert.equal(
    app.storedState().grupos[0].sorteio,
    null
  );
  assert.ok(
    app.document.getElementById("toastContainer").children.some(
      toast =>
        toast.dataset.type === "warning" &&
        toast.children[1].textContent.includes("grupo selecionado mudou")
    )
  );
});

test("updates selected image status and applies the chosen image automatically", () => {
  const app = createApp();
  const input = app.document.getElementById("imagemFundo");
  const status = app.document.getElementById("statusImagem");
  const arquivo = {
    name: "background.jpg",
    type: "image/jpeg",
    size: 1024,
  };
  input.files = [arquivo];

  app.context.tratarImagemDoGrupo({ target: input });
  assert.equal(status.textContent, "Imagem selecionada: background.jpg");
  assert.equal(status.title, "Imagem selecionada: background.jpg");
  assert.equal(app.readers.length, 1);
  assert.equal(app.context.getGrupoSelecionado().imagemFundo, null);

  app.readers[0].result = "data:image/jpeg;base64,abc";
  app.readers[0].onload();
  assert.equal(app.images.length, 1);
  assert.equal(app.context.getGrupoSelecionado().imagemFundo, null);

  app.images[0].onload();
  assert.equal(status.textContent, "Imagem aplicada: background.jpg");
  assert.equal(input.value, "");
  assert.equal(
    app.storedState().grupos[0].imagemFundo,
    "data:image/jpeg;base64,abc"
  );
  assert.ok(
    app.document.getElementById("toastContainer").children.some(
      toast => toast.dataset.type === "success"
    )
  );

  input.files = [];
  app.context.tratarImagemDoGrupo({ target: input });
  assert.equal(status.textContent, "Imagem aplicada: background.jpg");
});

test("uses warning and error toasts for invalid or unreadable image files", () => {
  const app = createApp();
  const input = app.document.getElementById("imagemFundo");
  const container = app.document.getElementById("toastContainer");

  input.files = [{ name: "document.pdf", type: "application/pdf", size: 100 }];
  app.context.tratarImagemDoGrupo({ target: input });
  assert.equal(container.children[0].dataset.type, "warning");
  assert.equal(input.value, "");
  assert.equal(
    app.document.getElementById("statusImagem").textContent,
    "Nenhuma imagem selecionada"
  );

  input.files = [{ name: "broken.png", type: "image/png", size: 100 }];
  app.context.tratarImagemDoGrupo({ target: input });
  app.readers[0].onerror();
  assert.ok(container.children.some(toast => toast.dataset.type === "error"));
  assert.equal(
    app.document.getElementById("statusImagem").textContent,
    "Nenhuma imagem selecionada"
  );

  input.files = [{ name: "corrupt.png", type: "image/png", size: 100 }];
  app.context.tratarImagemDoGrupo({ target: input });
  app.readers[1].result = "data:image/png;base64,invalid";
  app.readers[1].onload();
  app.images[0].onerror();
  assert.ok(container.children.filter(toast => toast.dataset.type === "error").length >= 2);
  assert.equal(app.context.getGrupoSelecionado().imagemFundo, null);
});

test("reports no image without changing group state or storage", () => {
  const app = createApp();
  const stateBefore = app.storage.get(STORAGE_KEY);
  app.context.removerImagemDoGrupo();

  const [toast] = app.document.getElementById("toastContainer").children;
  assert.equal(toast.children[1].textContent, "Nenhuma imagem de fundo encontrada.");
  assert.equal(toast.dataset.type, "info");
  assert.equal(app.storage.get(STORAGE_KEY), stateBefore);
});

test("removes an existing group background and shows a success toast", () => {
  const app = createApp();
  const group = app.context.getGrupoSelecionado();
  group.imagemFundo = "data:image/png;base64,abc";
  app.context.salvarEstado();

  app.context.removerImagemDoGrupo();

  const [toast] = app.document.getElementById("toastContainer").children;
  assert.equal(group.imagemFundo, null);
  assert.equal(
    app.storedState().grupos[0].imagemFundo,
    null
  );
  assert.equal(toast.children[1].textContent, "Imagem de fundo removida");
  assert.equal(toast.dataset.type, "success");
  assert.equal(
    app.document.getElementById("statusImagem").textContent,
    "Nenhuma imagem selecionada"
  );
});

test("does not use native alert dialogs and provides accessible image upload status", () => {
  assert.doesNotMatch(clientSource, /\balert\s*\(/);
  assert.match(htmlSource, /<label for="imagemFundo" class="botao-selecionar-imagem">/);
  assert.match(htmlSource, /id="statusImagem"[\s\S]*aria-live="polite"/);
  assert.match(stylesSource, /\.status-imagem\s*\{[^}]*text-overflow:\s*ellipsis/s);
});

test("loads and preserves older localStorage records without email or draw fields", () => {
  const app = createApp({
    grupos: [
      {
        id: "legacy",
        nome: "Família",
        participantes: [" Ana ", "Bruno"],
        imagemFundo: null,
      },
    ],
    grupoSelecionado: "legacy",
  });

  const saved = app.storedState();
  assert.equal(saved.grupos[0].nome, "Família");
  assert.deepEqual(Array.from(saved.grupos[0].participantes), [" Ana ", "Bruno"]);
  assert.equal("emails" in saved.grupos[0], false);
  assert.equal("sorteio" in saved.grupos[0], false);
  assert.equal(
    app.document.getElementById("listaParticipantes")
      .querySelectorAll(".email-participante-input")[0].value,
    ""
  );
  assert.equal(app.document.getElementById("contador").textContent, "2 participantes cadastrados");
  assert.equal(app.document.getElementById("sortear").disabled, false);
  assert.match(
    app.document.getElementById("roletaCanvas").attributes["aria-label"],
    /Ana, Bruno/
  );
});

test("does not overwrite malformed browser storage", () => {
  const app = createApp();
  app.storage.set(STORAGE_KEY, "{not-json");
  app.context.carregarEstado();
  app.document.getElementById("nomeGrupo").value = "Novo";
  app.context.salvarGrupo({ preventDefault() {} });
  assert.equal(app.storage.get(STORAGE_KEY), "{not-json");
  assert.match(app.document.getElementById("resumoNotificacoes").textContent, /preservados/);
  assert.equal(app.errors.length, 1);
});

test("supports editing and selecting groups without replacing another group", () => {
  const app = createApp();
  const groupName = app.document.getElementById("nomeGrupo");
  groupName.value = "Escritório";
  app.context.salvarGrupo({ preventDefault() {} });
  const workGroupId = app.storedState().grupos[1].id;

  app.context.iniciarEdicaoDeGrupo(workGroupId);
  groupName.value = "Colegas";
  app.context.salvarGrupo({ preventDefault() {} });
  assert.equal(app.storedState().grupos[1].nome, "Colegas");

  const defaultGroupId = app.storedState().grupos[0].id;
  app.context.selecionarGrupo(defaultGroupId);
  assert.equal(app.document.getElementById("nomeGrupoAtivo").textContent, "Meu grupo");
  app.context.selecionarGrupo(workGroupId);
  assert.equal(app.document.getElementById("nomeGrupoAtivo").textContent, "Colegas");
});

test("updates the wheel for the selected group and disables invalid draws", () => {
  const app = createApp();
  const spinButton = app.document.getElementById("sortear");
  assert.equal(spinButton.disabled, true);

  addParticipant(app, "Ana", "");
  assert.equal(spinButton.disabled, true);
  addParticipant(app, "Bruno", "");
  assert.equal(spinButton.disabled, false);

  app.document.getElementById("nomeGrupo").value = "Outro grupo";
  app.context.salvarGrupo({ preventDefault() {} });
  assert.equal(spinButton.disabled, true);
  assert.equal(
    app.document.getElementById("roletaCanvas").attributes["aria-label"],
    "Roleta vazia; adicione participantes ao grupo"
  );

  app.context.selecionarGrupo(app.storedState().grupos[0].id);
  assert.equal(spinButton.disabled, false);
  assert.match(
    app.document.getElementById("roletaCanvas").attributes["aria-label"],
    /Ana, Bruno/
  );
});

test("keeps labels inside individual wheel slices for small and larger groups", () => {
  const app = createApp();
  const canvas = app.document.getElementById("roletaCanvas");
  addParticipant(app, "Ana Maria", "");
  addParticipant(app, "Bruno", "");

  canvas.canvasCalls.clips = 0;
  canvas.canvasCalls.fillText = [];
  app.context.renderizarGrupoAtual();
  assert.equal(canvas.canvasCalls.clips, 2);
  assert.ok(canvas.canvasCalls.fillText.some(call => call.text === "Ana Maria"));
  assert.ok(canvas.canvasCalls.fillText.every(call => call.x === 0));
  assert.ok(canvas.canvasCalls.fillText.every(call => call.maxWidth === undefined));
  assert.equal(canvas.context2d.font, "bold 22px Arial");

  for (let indice = 0; indice < 18; indice += 1) {
    addParticipant(app, `Participante ${indice + 1}`, "");
  }
  canvas.canvasCalls.clips = 0;
  canvas.canvasCalls.fillText = [];
  canvas.canvasCalls.rotations = [];
  app.context.renderizarGrupoAtual();

  assert.equal(canvas.canvasCalls.clips, 20);
  assert.equal(
    canvas.canvasCalls.fillText.map(call => call.text).join("").includes("Participante"),
    true
  );
  assert.ok(canvas.canvasCalls.fillText.every(call => call.x === 0));
  assert.ok(canvas.canvasCalls.rotations.length >= 20);
  assert.match(canvas.context2d.font, /^bold (1[1-9]|2[0-1])(?:\.\d+)?px Arial$/);
});

test("supports unique groups, participant registration, persistence, and a no-self draw", () => {
  const app = createApp();
  const groupName = app.document.getElementById("nomeGrupo");
  groupName.value = " Amigos ";
  app.context.salvarGrupo({ preventDefault() {} });
  assert.equal(app.storedState().grupos.length, 2);

  groupName.value = "amigos";
  app.context.salvarGrupo({ preventDefault() {} });
  assert.match(app.document.getElementById("erroGrupo").textContent, /Já existe/);

  addParticipant(app, "Ana", "ana@example.com");
  addParticipant(app, "Bruno", "bruno@example.com");
  addParticipant(app, "Caio", "caio@example.com");
  addParticipant(app, " ana ", "another@example.com");
  assert.match(app.document.getElementById("erroParticipante").textContent, /já foi cadastrado/);

  app.document.getElementById("sortear").listeners.get("click")();
  confirmDraw(app);
  const atribuicoesDuranteAnimacao = app.storedState().grupos.find(
    item => item.nome === "Amigos"
  ).sorteio.atribuicoes;
  assert.equal(app.document.getElementById("sortear").hidden, false);
  assert.equal(app.document.getElementById("sortear").disabled, true);
  assert.match(
    app.document.getElementById("statusRoleta").textContent,
    /está girando/
  );
  app.context.iniciarSorteio();
  assert.deepEqual(
    app.storedState().grupos.find(item => item.nome === "Amigos")
      .sorteio.atribuicoes,
    atribuicoesDuranteAnimacao
  );
  app.finishAnimation();
  let group = app.storedState().grupos.find(item => item.nome === "Amigos");
  assert.equal(group.sorteio.processadas, 1);
  assert.equal(app.document.getElementById("sortear").hidden, false);
  assert.equal(
    app.document.getElementById("listaEmailsPreparados").children[0]
      .children[0].textContent,
    "E-mail individual desta etapa"
  );
  assert.doesNotMatch(
    app.document.getElementById("resumoNotificacoes").textContent,
    /tirou/
  );
  assert.equal(
    app.document.getElementById("listaEmailsPreparados").children.length,
    1
  );
  assert.match(
    app.document.getElementById("progressoSorteio").textContent,
    /Sorteio 2 de 3/
  );

  while (group.sorteio.processadas < group.sorteio.atribuicoes.length) {
    app.document.getElementById("sortear").listeners.get("click")();
    app.finishAnimation();
    group = app.storedState().grupos.find(item => item.nome === "Amigos");
  }

  assert.equal(group.sorteio.atribuicoes.length, 3);
  assert.equal(group.sorteio.processadas, 3);
  assert.ok(group.sorteio.atribuicoes.every(
    ({ nome, sorteado }) => nome !== sorteado
  ));
  assert.deepEqual(
    new Set(group.sorteio.atribuicoes.map(({ sorteado }) => sorteado)),
    new Set(group.participantes)
  );
  assert.equal(app.document.getElementById("sortear").hidden, true);
  assert.equal(
    app.document.getElementById("resumoNotificacoes").textContent,
    "Sorteio concluído e salvo neste navegador."
  );
  assert.match(
    app.document.getElementById("statusRoleta").textContent,
    /Todas as etapas foram processadas/
  );
  assert.match(
    app.document.getElementById("progressoSorteio").textContent,
    /Sorteio concluído: 3 de 3/
  );
  const anguloPorFatia = 360 / group.participantes.length;
  const rotacao = Number.parseFloat(
    app.document.getElementById("roletaCanvas").style.transform.match(/-?\d+(?:\.\d+)?/)[0]
  );
  const anguloNaFatia = ((rotacao % anguloPorFatia) + anguloPorFatia) % anguloPorFatia;
  assert.ok(Math.min(anguloNaFatia, anguloPorFatia - anguloNaFatia) < 0.001);

  const reloaded = createApp(app.storedState());
  const reloadedGroup = reloaded.storedState().grupos.find(
    item => item.nome === "Amigos"
  );
  assert.deepEqual(
    reloadedGroup.sorteio.atribuicoes,
    group.sorteio.atribuicoes
  );
  assert.equal(reloadedGroup.sorteio.processadas, 3);
  assert.doesNotMatch(
    reloaded.document.getElementById("statusRoleta").textContent,
    /tirou|sorteado/i
  );
  assert.equal(reloaded.document.getElementById("sortear").hidden, true);
  assert.match(
    reloaded.document.getElementById("statusRoleta").textContent,
    /Sorteio concluído/
  );
  assert.equal(
    reloaded.document.getElementById("listaParticipantes")
      .querySelectorAll(".email-participante-input")[0].disabled,
    false
  );
});

test("resumes a pending individual draw after reload without changing assignments", () => {
  const app = createApp();
  addParticipant(app, "Ana", "");
  addParticipant(app, "Bruno", "");
  addParticipant(app, "Caio", "");
  app.context.iniciarSorteio();
  confirmDraw(app);

  const originalAssignments = app.storedState().grupos[0].sorteio.atribuicoes;
  app.finishAnimation();
  const partialState = app.storedState();
  assert.equal(partialState.grupos[0].sorteio.processadas, 1);

  const reloaded = createApp(partialState);
  assert.equal(
    reloaded.document.getElementById("listaEmailsPreparados").children[0]
      .children[0].textContent,
    "E-mail individual desta etapa"
  );
  reloaded.document.getElementById("sortear").listeners.get("click")();
  reloaded.finishAnimation();
  assert.equal(reloaded.storedState().grupos[0].sorteio.processadas, 2);
  assert.deepEqual(
    reloaded.storedState().grupos[0].sorteio.atribuicoes,
    originalAssignments
  );
});

test("keeps every visible drawing status and email action generic", () => {
  const app = createApp();
  addParticipant(app, "Ana", "");
  addParticipant(app, "Bruno", "");
  app.context.iniciarSorteio();
  confirmDraw(app);
  app.finishAnimation();

  const emailItem = app.document.getElementById("listaEmailsPreparados")
    .children[0];
  assert.equal(emailItem.children[0].textContent, "E-mail individual desta etapa");
  assert.equal(emailItem.children[1].textContent, "Preparar rascunho");
  assert.doesNotMatch(
    [
      app.document.getElementById("mensagem-sorteio").textContent,
      app.document.getElementById("statusRoleta").textContent,
      app.document.getElementById("progressoSorteio").textContent,
      app.document.getElementById("resumoNotificacoes").textContent,
      emailItem.children.map(element => element.textContent).join(" "),
    ].join(" "),
    /tirou|sorteado|atribui[çc][ãa]o\s*:/i
  );
  assert.doesNotMatch(htmlSource, /id="resultadoAtual"/);
});

test("processes exactly one no-self assignment per spin for different group sizes", () => {
  for (const quantidade of [2, 7]) {
    const app = createApp();
    for (let indice = 0; indice < quantidade; indice += 1) {
      addParticipant(app, `Participante ${indice + 1}`, "");
    }

    app.document.getElementById("sortear").listeners.get("click")();
    confirmDraw(app);
    const atribuicoes = app.storedState().grupos[0].sorteio.atribuicoes;

    for (let processadas = 1; processadas <= quantidade; processadas += 1) {
      app.finishAnimation();
      const grupo = app.storedState().grupos[0];
      assert.equal(grupo.sorteio.processadas, processadas);
      assert.deepEqual(grupo.sorteio.atribuicoes, atribuicoes);
      assert.equal(
        app.document.getElementById("listaEmailsPreparados").children.length,
        1
      );
      if (processadas < quantidade) {
        app.document.getElementById("sortear").listeners.get("click")();
      }
    }

    assert.ok(atribuicoes.every(({ nome, sorteado }) => nome !== sorteado));
    assert.equal(
      new Set(atribuicoes.map(({ sorteado }) => sorteado)).size,
      quantidade
    );
    assert.equal(app.document.getElementById("sortear").hidden, true);
    assert.match(
      app.document.getElementById("progressoSorteio").textContent,
      new RegExp(`${quantidade} de ${quantidade}`)
    );
  }
});

test("does not mark an interrupted wheel animation as processed and allows retry", () => {
  const app = createApp();
  addParticipant(app, "Ana", "");
  addParticipant(app, "Bruno", "");
  const requestAnimationFrame = app.window.requestAnimationFrame;
  app.window.requestAnimationFrame = () => {
    throw new Error("animation unavailable");
  };

  app.context.iniciarSorteio();
  confirmDraw(app);
  assert.equal(app.storedState().grupos[0].sorteio.processadas, 0);
  assert.equal(app.document.getElementById("sortear").disabled, false);
  assert.ok(
    app.document.getElementById("toastContainer").children.some(
      toast =>
        toast.dataset.type === "error" &&
        toast.children[1].textContent.includes("giro foi interrompido")
    )
  );

  app.window.requestAnimationFrame = requestAnimationFrame;
  app.document.getElementById("sortear").listeners.get("click")();
  app.finishAnimation();
  assert.equal(app.storedState().grupos[0].sorteio.processadas, 1);
});

test("creates one correctly addressed manual draft with only its recipient's result", () => {
  const app = createApp();
  addParticipant(app, "Ana", "ana@example.com");
  addParticipant(app, "Bruno", "bruno@example.com");
  addParticipant(app, "Caio", "caio@example.com");
  app.context.iniciarSorteio();
  confirmDraw(app);
  app.finishAnimation();

  const group = app.storedState().grupos[0];
  const assignment = group.sorteio.atribuicoes[0];
  app.context.abrirEmailPreparado(0);

  const href = app.window.location.href;
  assert.ok(href.startsWith("mailto:"));
  assert.ok(href.includes("%0D%0A"));
  assert.equal(
    decodeURIComponent(href.slice("mailto:".length, href.indexOf("?"))),
    "ana@example.com"
  );
  const parameters = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  assert.equal(parameters.get("subject"), "🎁 SHHHH... Seu Amigo Secreto foi revelado! 🤫🎅");
  const body = parameters.get("body");
  assert.ok(body.includes(`🎁 ${assignment.sorteado} 🎁`));
  assert.equal(
    body,
    app.context.criarCorpoDoEmail(assignment.sorteado).replace(/\n/g, "\r\n")
  );
  assert.ok(!body.includes(`🎁 ${group.sorteio.atribuicoes[1].sorteado} 🎁`));
  assert.match(
    app.document.getElementById("resumoNotificacoes").textContent,
    /envie manualmente/
  );
  assert.doesNotMatch(
    app.document.getElementById("resumoNotificacoes").textContent,
    /e-mail enviado|mensagem enviada/i
  );
});

test("permits missing emails without showing an assignment in the page fallback", () => {
  const app = createApp();
  addParticipant(app, "Ana", "");
  addParticipant(app, "Bruno", "");
  app.context.iniciarSorteio();
  confirmDraw(app);
  app.finishAnimation();
  assert.ok(app.storedState().grupos[0].sorteio);
  app.context.abrirEmailPreparado(0);
  assert.match(
    app.document.getElementById("resumoNotificacoes").textContent,
    /Adicione um e-mail válido/
  );

  app.document.getElementById("listaParticipantes")
    .querySelectorAll(".email-participante-input")[0].value = "ana@example.com";
  app.context.validarEmailsDoGrupo();
  app.context.copiarEmailPreparado(0);
  assert.equal(app.document.getElementById("fallbackEmail").hidden, true);
  assert.equal(app.document.getElementById("textoFallbackEmail").value, "");
  assert.match(
    app.document.getElementById("resumoNotificacoes").textContent,
    /Preparar rascunho/
  );
});

test("clears email validation feedback when its group is changed or deleted", () => {
  const app = createApp();
  addParticipant(app, "Ana", "");
  addParticipant(app, "Bruno", "");
  app.context.iniciarSorteio();
  confirmDraw(app);
  app.finishAnimation();
  app.context.abrirEmailPreparado(0);

  const summary = app.document.getElementById("resumoNotificacoes");
  assert.match(summary.textContent, /Adicione um e-mail válido/);

  app.document.getElementById("nomeGrupo").value = "Outro grupo";
  app.context.salvarGrupo({ preventDefault() {} });
  assert.equal(summary.textContent, "");

  const originalGroupId = app.storedState().grupos[0].id;
  app.context.selecionarGrupo(originalGroupId);
  app.context.abrirEmailPreparado(0);
  assert.match(summary.textContent, /Adicione um e-mail válido/);

  app.context.excluirGrupo(originalGroupId);
  const confirmation = app.document
    .getElementById("toastContainer")
    .children.find(toast =>
      toast.children[1].textContent.includes("Outro grupo") === false
    );
  assert.ok(confirmation);
  confirmation.children[2].children
    .find(button => button.textContent === "Cancelar")
    .listeners.get("click")();
  assert.match(summary.textContent, /Adicione um e-mail válido/);

  app.context.confirmarExclusaoDeGrupo(originalGroupId);
  assert.equal(summary.textContent, "");
  assert.equal(app.context.getGrupoSelecionado().nome, "Outro grupo");
});

test("clears the missing-email warning when corrected and keeps validation retryable", () => {
  const app = createApp();
  addParticipant(app, "Ana", "");
  addParticipant(app, "Bruno", "");
  app.context.iniciarSorteio();
  confirmDraw(app);
  app.finishAnimation();

  const summary = app.document.getElementById("resumoNotificacoes");
  app.context.abrirEmailPreparado(0);
  const firstAssignment = app.storedState().grupos[0].sorteio.atribuicoes[0];
  const indiceParticipante = app.storedState().grupos[0].participantes.indexOf(
    firstAssignment.nome
  );
  const emailInput = app.document
    .getElementById("listaParticipantes")
    .querySelectorAll(".email-participante-input")[indiceParticipante];
  app.document.getElementById("listaParticipantes").listeners.get("input")({
    target: { closest: () => emailInput },
  });
  assert.match(summary.textContent, /Adicione um e-mail válido/);

  emailInput.value = "ana@example.com";
  app.document.getElementById("listaParticipantes").listeners.get("input")({
    target: { closest: () => emailInput },
  });
  assert.equal(summary.textContent, "");

  app.context.abrirEmailPreparado(0);
  assert.ok(app.window.location.href.startsWith("mailto:"));
  assert.match(summary.textContent, /Rascunho solicitado/);
});
