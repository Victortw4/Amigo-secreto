const nomeInput = document.getElementById("participante");
const emailInput = document.getElementById("emailParticipante");
const add = document.getElementById("adicionar");
const lista = document.getElementById("listaParticipantes");
const contador = document.getElementById("contador");
const botaoSortear = document.getElementById("sortear");
const mensagem = document.getElementById("mensagem-sorteio");
const resumoNotificacoes = document.getElementById("resumoNotificacoes");
const emailsPreparados = document.getElementById("emailsPreparados");
const listaEmailsPreparados = document.getElementById("listaEmailsPreparados");
const progressoSorteio = document.getElementById("progressoSorteio");
const fallbackEmail = document.getElementById("fallbackEmail");
const textoFallbackEmail = document.getElementById("textoFallbackEmail");
const inputImagem = document.getElementById("imagemFundo");
const statusImagem = document.getElementById("statusImagem");
const toastContainer = document.getElementById("toastContainer");
const palcoRoleta = document.getElementById("palcoRoleta");
const canvasRoleta = document.getElementById("roletaCanvas");
const contextoRoleta = canvasRoleta.getContext("2d");
const statusRoleta = document.getElementById("statusRoleta");
const STORAGE_KEY = "amigoSecretoGrupos";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_SUBJECT = "🎁 SHHHH... Seu Amigo Secreto foi revelado! 🤫🎅";
const CORES_ROLETA = ["#7c3aed", "#be185d", "#0f766e", "#b45309", "#1d4ed8", "#9f1239"];
const DURACAO_ROLETA = 5200;

let state = { grupos: [], grupoSelecionado: null };
let grupoEmEdicaoId = null;
let participantes = [];
let emails = new Map();
let acaoEmAndamento = false;
let armazenamentoInvalido = false;
let roletaGirando = false;
let rotacaoRoleta = 0;
let rotacaoFinalRoleta = null;
let avisoEmailPendente = null;
const nomesImagensAplicadas = new Map();

function showToast(message, type = "info", actions = [], duration = 4200) {
  const estilos = {
    success: { icone: "✓", role: "status", live: "polite" },
    error: { icone: "!", role: "alert", live: "assertive" },
    warning: { icone: "⚠", role: "alert", live: "assertive" },
    info: { icone: "i", role: "status", live: "polite" },
  };
  const estilo = estilos[type] || estilos.info;
  const toast = document.createElement("div");
  const icone = document.createElement("span");
  const texto = document.createElement("span");

  toast.className = "toast";
  toast.dataset.type = estilos[type] ? type : "info";
  toast.setAttribute("role", estilo.role);
  toast.setAttribute("aria-live", estilo.live);
  icone.className = "toast-icon";
  icone.setAttribute("aria-hidden", "true");
  icone.textContent = estilo.icone;
  texto.textContent = message;
  toast.append(icone, texto);

  if (actions.length) {
    const botoesAcao = document.createElement("div");
    botoesAcao.className = "toast-actions";
    actions.forEach(acao => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "toast-action";
      botao.textContent = acao.label;
      botao.addEventListener("click", () => {
        toast.remove();
        acao.executar();
      });
      botoesAcao.appendChild(botao);
    });
    toast.appendChild(botoesAcao);
  }

  toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("saindo");
    window.setTimeout(() => toast.remove(), 200);
  }, duration);
}

function atualizarStatusImagem(grupo, mensagemTemporaria = "") {
  if (mensagemTemporaria) {
    statusImagem.textContent = mensagemTemporaria;
    statusImagem.title = mensagemTemporaria;
    return;
  }

  const nomeImagem = grupo ? nomesImagensAplicadas.get(grupo.id) : "";
  const status = nomeImagem
    ? `Imagem aplicada: ${nomeImagem}`
    : grupo?.imagemFundo
      ? "Imagem de fundo aplicada"
      : "Nenhuma imagem selecionada";
  statusImagem.textContent = status;
  statusImagem.title = status;
}

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

function criarGrupoBase(nome, listaInicial = []) {
  return {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `grupo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nome,
    participantes: listaInicial.map(normalizarTexto),
    emails: {},
    imagemFundo: null,
    sorteio: null,
  };
}

function getGrupoSelecionado() {
  return state.grupos.find(grupo => grupo.id === state.grupoSelecionado) || null;
}

function atualizarAvisoDeArmazenamento() {
  if (armazenamentoInvalido) {
    resumoNotificacoes.textContent =
      "Os dados salvos não puderam ser lidos e foram preservados sem sobrescrita. As alterações desta sessão não serão persistidas.";
  }
}

function limparAvisoEmailPendente(idGrupo, nomeParticipante) {
  if (
    !avisoEmailPendente ||
    (idGrupo && avisoEmailPendente.idGrupo !== idGrupo) ||
    (nomeParticipante && avisoEmailPendente.nomeParticipante !== nomeParticipante)
  ) {
    return;
  }

  if (resumoNotificacoes.textContent === avisoEmailPendente.mensagem) {
    resumoNotificacoes.textContent = "";
  }
  avisoEmailPendente = null;
}

function salvarEstado() {
  if (armazenamentoInvalido) {
    atualizarAvisoDeArmazenamento();
    return false;
  }

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        grupos: state.grupos,
        grupoSelecionado: state.grupoSelecionado,
      })
    );
    return true;
  } catch (erro) {
    console.error("Não foi possível salvar os grupos.", erro);
    resumoNotificacoes.textContent =
      "Não foi possível salvar as alterações neste navegador. Verifique o espaço disponível e tente novamente.";
    return false;
  }
}

function sorteioValido(sorteio, nomes) {
  const atribuicoes = sorteio?.atribuicoes;
  if (!Array.isArray(atribuicoes) || atribuicoes.length !== nomes.length) {
    return null;
  }

  const participantes = new Set(nomes);
  const origens = new Set();
  const destinos = new Set();
  const valido = atribuicoes.every(atribuicao => {
    if (
      !atribuicao ||
      typeof atribuicao.nome !== "string" ||
      typeof atribuicao.sorteado !== "string" ||
      !participantes.has(atribuicao.nome) ||
      !participantes.has(atribuicao.sorteado) ||
      atribuicao.nome === atribuicao.sorteado ||
      origens.has(atribuicao.nome) ||
      destinos.has(atribuicao.sorteado)
    ) {
      return false;
    }

    origens.add(atribuicao.nome);
    destinos.add(atribuicao.sorteado);
    return true;
  });

  return valido && origens.size === nomes.length && destinos.size === nomes.length
    ? atribuicoes
    : null;
}

function sincronizarEstadoDoGrupo() {
  const grupo = getGrupoSelecionado();
  if (!grupo) {
    return;
  }

  grupo.participantes = [...participantes];
  grupo.emails = Object.fromEntries(emails);
}

function sincronizarInterfaceComGrupo() {
  const grupo = getGrupoSelecionado();
  if (!grupo) {
    participantes = [];
    emails = new Map();
    return;
  }

  participantes = Array.isArray(grupo.participantes)
    ? [...grupo.participantes]
    : [];
  emails = new Map(
    Object.entries(
      grupo.emails && typeof grupo.emails === "object" ? grupo.emails : {}
    )
  );
}

function validarNomeDoGrupo(nome, idIgnorado = null) {
  const valor = normalizarTexto(nome);
  if (!valor) {
    return { valido: false, mensagem: "Informe um nome para o grupo." };
  }

  const nomeNormalizado = valor.toLocaleLowerCase();
  const duplicado = state.grupos.some(grupo => {
    return (
      grupo.id !== idIgnorado &&
      normalizarTexto(grupo.nome).toLocaleLowerCase() === nomeNormalizado
    );
  });

  if (duplicado) {
    return {
      valido: false,
      mensagem: "Já existe um grupo com esse nome. Escolha outro.",
    };
  }

  return { valido: true, mensagem: "" };
}

function resetarFormularioGrupo() {
  const formGrupo = document.getElementById("formGrupo");
  const nomeGrupo = document.getElementById("nomeGrupo");
  const erroGrupo = document.getElementById("erroGrupo");
  const salvarGrupoButton = document.getElementById("salvarGrupo");
  const cancelarGrupoButton = document.getElementById("cancelarGrupo");

  formGrupo.reset();
  erroGrupo.textContent = "";
  grupoEmEdicaoId = null;
  salvarGrupoButton.textContent = "Criar grupo";
  cancelarGrupoButton.hidden = true;
  nomeGrupo.focus();
}

function renderizarListaGrupos() {
  const listaGrupos = document.getElementById("listaGrupos");
  listaGrupos.innerHTML = "";

  if (!state.grupos.length) {
    const item = document.createElement("li");
    item.textContent = "Nenhum grupo cadastrado.";
    listaGrupos.appendChild(item);
    return;
  }

  state.grupos.forEach(grupo => {
    const item = document.createElement("li");
    item.className = `grupo-item${grupo.id === state.grupoSelecionado ? " ativo" : ""}`;

    const botaoSelecao = document.createElement("button");
    botaoSelecao.type = "button";
    botaoSelecao.className = "grupo-selecao";
    botaoSelecao.textContent = grupo.nome;
    botaoSelecao.dataset.id = grupo.id;
    botaoSelecao.dataset.acao = "selecionar";
    botaoSelecao.disabled = acaoEmAndamento;

    const botaoEditar = document.createElement("button");
    botaoEditar.type = "button";
    botaoEditar.className = "botao-editar";
    botaoEditar.textContent = "✎";
    botaoEditar.title = `Editar ${grupo.nome}`;
    botaoEditar.dataset.id = grupo.id;
    botaoEditar.dataset.acao = "editar";
    botaoEditar.disabled = acaoEmAndamento;

    const botaoExcluir = document.createElement("button");
    botaoExcluir.type = "button";
    botaoExcluir.className = "botao-excluir";
    botaoExcluir.textContent = "✕";
    botaoExcluir.title = `Excluir ${grupo.nome}`;
    botaoExcluir.dataset.id = grupo.id;
    botaoExcluir.dataset.acao = "excluir";
    botaoExcluir.disabled = acaoEmAndamento;

    item.append(botaoSelecao, botaoEditar, botaoExcluir);
    listaGrupos.appendChild(item);
  });
}

function renderizarImagemDeFundo() {
  const grupo = getGrupoSelecionado();
  const imagem = grupo?.imagemFundo || "";

  if (!imagem) {
    document.body.style.backgroundImage = "none";
    document.body.classList.remove("com-imagem");
    return;
  }

  document.body.style.backgroundImage = `url("${imagem}")`;
  document.body.classList.add("com-imagem");
}

function renderizarParticipantes() {
  lista.innerHTML = "";

  participantes.forEach((nome, indice) => {
    const item = document.createElement("li");
    const nomeTexto = document.createElement("span");
    const emailLabel = document.createElement("label");
    const emailInputParticipante = document.createElement("input");
    const botaoRemover = document.createElement("button");

    nomeTexto.className = "nome-participante";
    nomeTexto.textContent = nome;

    emailLabel.className = "email-participante";
    emailLabel.htmlFor = `emailParticipante-${indice}`;
    emailLabel.textContent = "E-mail";
    emailInputParticipante.type = "email";
    emailInputParticipante.id = `emailParticipante-${indice}`;
    emailInputParticipante.maxLength = 254;
    emailInputParticipante.className = "email-participante-input";
    emailInputParticipante.value = emails.get(nome) || "";
    emailInputParticipante.setAttribute("aria-label", `E-mail de ${nome}`);
    emailInputParticipante.dataset.index = String(indice);

    botaoRemover.type = "button";
    botaoRemover.className = "remover-participante";
    botaoRemover.textContent = "Remover";
    botaoRemover.dataset.index = String(indice);

    item.append(nomeTexto, emailLabel, emailInputParticipante, botaoRemover);
    lista.appendChild(item);
  });

  const quantidade = participantes.length;
  contador.textContent = `${quantidade} participante${quantidade === 1 ? "" : "s"} cadastrado${quantidade === 1 ? "" : "s"}`;
}

function renderizarAcoesDeEmail(grupo) {
  listaEmailsPreparados.innerHTML = "";
  fallbackEmail.hidden = true;
  textoFallbackEmail.value = "";
  const indice = indiceAtribuicaoRevelada(grupo);
  const atribuicao = grupo?.sorteio?.atribuicoes[indice];
  emailsPreparados.hidden = !atribuicao;

  if (!atribuicao) {
    return;
  }

  const item = document.createElement("li");
  const nome = document.createElement("span");
  const preparar = document.createElement("button");
  const copiar = document.createElement("button");

  nome.textContent = "E-mail individual desta etapa";
  preparar.type = "button";
  preparar.className = "preparar-email";
  preparar.textContent = "Preparar rascunho";
  preparar.dataset.index = String(indice);
  copiar.type = "button";
  copiar.className = "copiar-email";
  copiar.textContent = "Copiar mensagem";
  copiar.dataset.index = String(indice);
  item.append(nome, preparar, copiar);
  listaEmailsPreparados.appendChild(item);
}

function indiceAtribuicaoRevelada(grupo) {
  if (!grupo?.sorteio || roletaGirando) {
    return -1;
  }
  return Math.min(grupo.sorteio.processadas, grupo.sorteio.atribuicoes.length) - 1;
}

function renderizarProgressoSorteio(grupo) {
  const total = grupo?.sorteio?.atribuicoes.length || participantes.length;
  const processadas = grupo?.sorteio?.processadas || 0;

  if (!grupo?.sorteio) {
    progressoSorteio.textContent = total
      ? `Pronto para o primeiro sorteio de ${total}.`
      : "Adicione participantes para iniciar o sorteio.";
    return;
  }

  if (processadas >= total) {
    progressoSorteio.textContent = `Sorteio concluído: ${total} de ${total}.`;
  } else {
    const etapa = Math.min(processadas + 1, total);
    progressoSorteio.textContent = roletaGirando
      ? `Sorteio ${etapa} de ${total} em andamento...`
      : `Sorteio ${etapa} de ${total}.`;
  }

}

function quebrarNomeDaRoleta(nome, larguraMaxima) {
  const linhas = [];
  let linha = "";

  nome.split(/\s+/).forEach(palavra => {
    let parte = "";
    Array.from(palavra).forEach(caractere => {
      if (
        parte &&
        contextoRoleta.measureText(parte + caractere).width > larguraMaxima
      ) {
        if (linha) {
          linhas.push(linha);
          linha = "";
        }
        linhas.push(parte);
        parte = caractere;
      } else {
        parte += caractere;
      }
    });

    if (parte) {
      const tentativa = linha ? `${linha} ${parte}` : parte;
      if (linha && contextoRoleta.measureText(tentativa).width > larguraMaxima) {
        linhas.push(linha);
        linha = parte;
      } else {
        linha = tentativa;
      }
    }
  });

  if (linha) {
    linhas.push(linha);
  }
  return linhas;
}

function renderizarRoleta(grupo) {
  const centro = canvasRoleta.width / 2;
  const raio = centro - 12;
  const quantidade = participantes.length;
  contextoRoleta.clearRect(0, 0, canvasRoleta.width, canvasRoleta.height);

  if (!roletaGirando) {
    canvasRoleta.style.transform = `rotate(${rotacaoRoleta}deg)`;
  }

  const rotacaoParaOrientarTexto =
    rotacaoFinalRoleta ?? rotacaoRoleta;

  if (!quantidade) {
    contextoRoleta.beginPath();
    contextoRoleta.arc(centro, centro, raio, 0, Math.PI * 2);
    contextoRoleta.fillStyle = "#353544";
    contextoRoleta.fill();
    contextoRoleta.fillStyle = "#e4e4ef";
    contextoRoleta.font = "bold 28px Arial";
    contextoRoleta.textAlign = "center";
    contextoRoleta.textBaseline = "middle";
    contextoRoleta.fillText("Sem participantes", centro, centro, raio * 1.5);
  } else {
    const anguloFatia = (Math.PI * 2) / quantidade;
    participantes.forEach((nome, indice) => {
      const inicio = -Math.PI / 2 + indice * anguloFatia;
      const fim = inicio + anguloFatia;
      const meio = inicio + anguloFatia / 2;

      contextoRoleta.beginPath();
      contextoRoleta.moveTo(centro, centro);
      contextoRoleta.arc(centro, centro, raio, inicio, fim);
      contextoRoleta.closePath();
      contextoRoleta.fillStyle = CORES_ROLETA[indice % CORES_ROLETA.length];
      contextoRoleta.fill();
      contextoRoleta.strokeStyle = "rgba(255, 255, 255, 0.8)";
      contextoRoleta.lineWidth = 3;
      contextoRoleta.stroke();

      const orientacaoTangencial = meio + Math.PI / 2;
      const orientacaoFinal =
        orientacaoTangencial + (rotacaoParaOrientarTexto * Math.PI) / 180;
      const orientacaoFinalNormalizada =
        ((orientacaoFinal % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2);
      const inverterTexto =
        orientacaoFinalNormalizada >= Math.PI / 2 &&
        orientacaoFinalNormalizada <= (Math.PI * 3) / 2;
      const raioDoTexto = raio * 0.72;
      const larguraMaxima = Math.max(
        8,
        2 * raioDoTexto * Math.sin(Math.min(anguloFatia / 2, Math.PI / 2)) * 0.84
      );
      const tamanhoFonte = Math.max(
        11,
        Math.min(22, 24 - Math.sqrt(quantidade))
      );
      const alturaLinha = tamanhoFonte * 1.1;

      contextoRoleta.save();
      contextoRoleta.beginPath();
      contextoRoleta.moveTo(centro, centro);
      contextoRoleta.arc(centro, centro, raio, inicio, fim);
      contextoRoleta.closePath();
      contextoRoleta.clip();
      contextoRoleta.translate(centro, centro);
      contextoRoleta.rotate(orientacaoTangencial);
      if (inverterTexto) {
        contextoRoleta.rotate(Math.PI);
      }
      contextoRoleta.fillStyle = "#ffffff";
      contextoRoleta.font = `bold ${tamanhoFonte}px Arial`;
      contextoRoleta.textAlign = "center";
      contextoRoleta.textBaseline = "middle";
      const linhas = quebrarNomeDaRoleta(nome, larguraMaxima);
      const sinalRadial = inverterTexto ? 1 : -1;
      const inicioDasLinhas =
        sinalRadial * raioDoTexto -
        ((linhas.length - 1) * alturaLinha) / 2;
      linhas.forEach((linha, indiceLinha) => {
        contextoRoleta.fillText(
          linha,
          0,
          inicioDasLinhas + indiceLinha * alturaLinha
        );
      });
      contextoRoleta.restore();
    });

    contextoRoleta.beginPath();
    contextoRoleta.arc(centro, centro, raio * 0.17, 0, Math.PI * 2);
    contextoRoleta.fillStyle = "#f8fafc";
    contextoRoleta.fill();
    contextoRoleta.strokeStyle = "#353544";
    contextoRoleta.lineWidth = 5;
    contextoRoleta.stroke();
  }

  canvasRoleta.setAttribute(
    "aria-label",
    quantidade
      ? `Roleta com ${quantidade} participantes: ${participantes.join(", ")}`
      : "Roleta vazia; adicione participantes ao grupo"
  );

  if (roletaGirando) {
    statusRoleta.textContent = "A roleta está girando...";
  } else if (grupo?.sorteio) {
    statusRoleta.textContent =
      grupo.sorteio.processadas >= grupo.sorteio.atribuicoes.length
        ? "Sorteio concluído. Todas as etapas foram processadas."
        : "A roleta está pronta para a próxima etapa.";
  } else if (quantidade < 2) {
    statusRoleta.textContent =
      "Adicione pelo menos dois participantes para habilitar o sorteio.";
  } else {
    statusRoleta.textContent = `${quantidade} participantes na roleta. Tudo pronto para sortear.`;
  }
}

function atualizarInterfaceDoGrupo() {
  const grupo = getGrupoSelecionado();
  const nomeGrupoAtivo = document.getElementById("nomeGrupoAtivo");
  const erroParticipante = document.getElementById("erroParticipante");

  if (!grupo) {
    nomeGrupoAtivo.textContent = "Nenhum grupo";
    lista.innerHTML = "";
    contador.textContent = "0 participantes cadastrados";
    botaoSortear.disabled = true;
    atualizarStatusImagem(null);
    renderizarRoleta(null);
    renderizarAcoesDeEmail(null);
    renderizarProgressoSorteio(null);
    mensagem.textContent = "Crie ou selecione um grupo para começar.";
    atualizarAvisoDeArmazenamento();
    return;
  }

  nomeGrupoAtivo.textContent = grupo.nome;
  renderizarParticipantes();
  renderizarImagemDeFundo();
  atualizarStatusImagem(grupo);
  renderizarRoleta(grupo);
  renderizarProgressoSorteio(grupo);

  const quantidadeProcessada = grupo.sorteio?.processadas || 0;
  const sorteioConcluido = Boolean(
    grupo.sorteio &&
    quantidadeProcessada >= grupo.sorteio.atribuicoes.length
  );
  const edicaoBloqueada = acaoEmAndamento || Boolean(grupo.sorteio);

  nomeInput.disabled = edicaoBloqueada;
  emailInput.disabled = edicaoBloqueada;
  add.disabled = edicaoBloqueada;
  document.querySelectorAll(".remover-participante").forEach(elemento => {
    elemento.disabled = edicaoBloqueada;
  });
  document.querySelectorAll(".email-participante-input").forEach(elemento => {
    elemento.disabled = acaoEmAndamento;
  });
  document.getElementById("imagemFundo").disabled = acaoEmAndamento;
  document.getElementById("removerImagem").disabled = acaoEmAndamento;
  botaoSortear.hidden = sorteioConcluido;
  botaoSortear.disabled = acaoEmAndamento || participantes.length < 2;
  botaoSortear.textContent = grupo.sorteio ? "Próximo sorteio" : "Sortear";
  if (acaoEmAndamento) {
    botaoSortear.textContent = "Sorteando...";
  }
  renderizarAcoesDeEmail(grupo);
  erroParticipante.textContent = "";

  if (sorteioConcluido) {
    mensagem.textContent =
      "Todos os sorteios individuais foram processados.";
    atualizarAvisoDeArmazenamento();
    return;
  }

  if (grupo.sorteio) {
    mensagem.textContent =
      "Cada giro avança uma etapa. Prepare o rascunho individual desta etapa ou prossiga para o próximo sorteio.";
    atualizarAvisoDeArmazenamento();
    return;
  }

  mensagem.textContent =
    "Adicione pelo menos dois participantes para realizar o sorteio.";
  atualizarAvisoDeArmazenamento();
}

function renderizarGrupoAtual() {
  sincronizarInterfaceComGrupo();
  atualizarInterfaceDoGrupo();
}

function carregarEstado() {
  try {
    const dados = localStorage.getItem(STORAGE_KEY);
    if (!dados) {
      const grupoPadrao = criarGrupoBase("Meu grupo");
      state.grupos = [grupoPadrao];
      state.grupoSelecionado = grupoPadrao.id;
      return;
    }

    const salvos = JSON.parse(dados);
    if (
      !salvos ||
      typeof salvos !== "object" ||
      !Array.isArray(salvos.grupos) ||
      !salvos.grupos.length
    ) {
      throw new Error("Formato de grupos salvos inválido.");
    }
    const gruposSalvos = salvos.grupos;

    state.grupos = gruposSalvos.map(grupo => {
      const participantesSalvos = Array.isArray(grupo.participantes)
        ? grupo.participantes.map(normalizarTexto).filter(Boolean)
        : [];
      const atribuicoesSalvas = sorteioValido(
        grupo.sorteio,
        participantesSalvos
      );
      const processadasSalvas = atribuicoesSalvas
        ? Number.isInteger(grupo.sorteio?.processadas)
          ? Math.max(
              0,
              Math.min(grupo.sorteio.processadas, atribuicoesSalvas.length)
            )
          : atribuicoesSalvas.length
        : 0;
      const emailsSalvos = new Map(
        Object.entries(
          grupo.emails && typeof grupo.emails === "object" ? grupo.emails : {}
        )
      );

      return {
        id: grupo.id || criarGrupoBase("").id,
        nome: normalizarTexto(grupo.nome || "Meu grupo"),
        participantes: participantesSalvos,
        emails: Object.fromEntries(
          participantesSalvos.map(nome => [
            nome,
            String(emailsSalvos.get(nome) || ""),
          ])
        ),
        imagemFundo: grupo.imagemFundo || null,
        sorteio: atribuicoesSalvas
          ? {
              atribuicoes: atribuicoesSalvas,
              processadas: processadasSalvas,
            }
          : null,
      };
    });
    state.grupoSelecionado = state.grupos.some(
      grupo => grupo.id === salvos.grupoSelecionado
    )
      ? salvos.grupoSelecionado
      : state.grupos[0].id;
  } catch (erro) {
    console.error("Não foi possível carregar os grupos salvos.", erro);
    armazenamentoInvalido = true;
    resumoNotificacoes.textContent =
      "Os dados salvos não puderam ser lidos e foram preservados sem sobrescrita.";
    const grupoPadrao = criarGrupoBase("Meu grupo");
    state.grupos = [grupoPadrao];
    state.grupoSelecionado = grupoPadrao.id;
  }
  sincronizarInterfaceComGrupo();
  sincronizarInterfaceComGrupo();
}

function salvarGrupo(event) {
  event.preventDefault();

  const nomeGrupo = document.getElementById("nomeGrupo");
  const erroGrupo = document.getElementById("erroGrupo");
  const nome = normalizarTexto(nomeGrupo.value);
  const validacao = validarNomeDoGrupo(nome, grupoEmEdicaoId);

  if (!validacao.valido) {
    erroGrupo.textContent = validacao.mensagem;
    return;
  }

  const idEditado = grupoEmEdicaoId;
  if (idEditado) {
    const grupo = state.grupos.find(item => item.id === idEditado);
    if (grupo) {
      grupo.nome = nome;
    }
  } else {
    const novoGrupo = criarGrupoBase(nome);
    state.grupos.push(novoGrupo);
    limparAvisoEmailPendente(state.grupoSelecionado);
    state.grupoSelecionado = novoGrupo.id;
  }

  resetarFormularioGrupo();
  salvarEstado();
  renderizarListaGrupos();
  renderizarGrupoAtual();
}

function iniciarEdicaoDeGrupo(id) {
  const grupo = state.grupos.find(item => item.id === id);
  if (!grupo) {
    return;
  }

  grupoEmEdicaoId = id;
  document.getElementById("nomeGrupo").value = grupo.nome;
  document.getElementById("erroGrupo").textContent = "";
  document.getElementById("salvarGrupo").textContent = "Salvar grupo";
  document.getElementById("cancelarGrupo").hidden = false;
  document.getElementById("nomeGrupo").focus();
}

function selecionarGrupo(id) {
  const grupo = state.grupos.find(item => item.id === id);
  if (!grupo || acaoEmAndamento) {
    return;
  }

  limparAvisoEmailPendente(state.grupoSelecionado);
  state.grupoSelecionado = id;
  rotacaoRoleta = 0;
  salvarEstado();
  renderizarListaGrupos();
  renderizarGrupoAtual();
}

function excluirGrupo(id) {
  const grupo = state.grupos.find(item => item.id === id);
  if (!grupo) {
    showToast("O grupo não foi encontrado.", "error");
    return;
  }
  if (acaoEmAndamento) {
    showToast("Aguarde a conclusão da ação em andamento.", "warning");
    return;
  }

  showToast(
    `Deseja excluir o grupo "${grupo.nome}" deste navegador?`,
    "warning",
    [
      { label: "Excluir", executar: () => confirmarExclusaoDeGrupo(id) },
      { label: "Cancelar", executar: () => {} },
    ],
    10000
  );
}

function confirmarExclusaoDeGrupo(id) {
  const grupo = state.grupos.find(item => item.id === id);
  if (!grupo || acaoEmAndamento) {
    showToast(
      grupo
        ? "Aguarde a conclusão da ação em andamento."
        : "O grupo não foi encontrado.",
      grupo ? "warning" : "error"
    );
    return;
  }

  limparAvisoEmailPendente(id);
  state.grupos = state.grupos.filter(item => item.id !== id);
  if (state.grupoSelecionado === id) {
    state.grupoSelecionado = state.grupos[0]?.id || null;
    rotacaoRoleta = 0;
  }
  if (!state.grupos.length) {
    const novoGrupo = criarGrupoBase("Meu grupo");
    state.grupos.push(novoGrupo);
    state.grupoSelecionado = novoGrupo.id;
  }

  const salvo = salvarEstado();
  renderizarListaGrupos();
  renderizarGrupoAtual();
  showToast(
    salvo
      ? "Grupo removido com sucesso!"
      : "Grupo removido nesta sessão, mas não foi possível salvar a alteração.",
    salvo ? "success" : "warning"
  );
}

function adicionarParticipante() {
  const grupo = getGrupoSelecionado();
  const nome = normalizarTexto(nomeInput.value);
  const email = emailInput.value.trim();
  const erroParticipante = document.getElementById("erroParticipante");

  if (!grupo) {
    erroParticipante.textContent = "Crie ou selecione um grupo antes de incluir participantes.";
    return;
  }
  if (!nome) {
    erroParticipante.textContent = "Digite o nome do participante.";
    nomeInput.focus();
    return;
  }
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 254)) {
    erroParticipante.textContent = `Informe um e-mail válido para ${nome}.`;
    emailInput.focus();
    return;
  }

  const jaExiste = participantes.some(
    participante => normalizarTexto(participante).toLocaleLowerCase() === nome.toLocaleLowerCase()
  );
  if (jaExiste) {
    erroParticipante.textContent = "Esse participante já foi cadastrado nesse grupo.";
    return;
  }

  participantes.push(nome);
  emails.set(nome, email);
  nomeInput.value = "";
  emailInput.value = "";
  sincronizarEstadoDoGrupo();
  salvarEstado();
  atualizarInterfaceDoGrupo();
  nomeInput.focus();
}

function removerParticipante(index) {
  if (!getGrupoSelecionado() || acaoEmAndamento) {
    return;
  }

  const [nome] = participantes.splice(index, 1);
  emails.delete(nome);
  sincronizarEstadoDoGrupo();
  salvarEstado();
  atualizarInterfaceDoGrupo();
}

function validarEmailsDoGrupo() {
  const erros = [];
  const inputs = lista.querySelectorAll(".email-participante-input");

  inputs.forEach(input => {
    const nome = participantes[Number(input.dataset.index)];
    const email = input.value.trim();
    const valido = !email || (EMAIL_PATTERN.test(email) && email.length <= 254);
    input.setAttribute("aria-invalid", String(!valido));
    if (!valido) {
      erros.push(nome);
    }
    emails.set(nome, email);
  });

  sincronizarEstadoDoGrupo();
  salvarEstado();
  return erros;
}

function definirAcaoEmAndamento(ativa) {
  acaoEmAndamento = ativa;
  renderizarListaGrupos();
  atualizarInterfaceDoGrupo();
}

function iniciarSorteio() {
  const grupo = getGrupoSelecionado();
  if (!grupo) {
    showToast("Crie ou selecione um grupo antes de sortear.", "warning");
    return;
  }
  if (acaoEmAndamento) {
    showToast("Aguarde a conclusão da ação em andamento.", "warning");
    return;
  }

  if (participantes.length < 2) {
    showToast("Adicione pelo menos dois participantes.", "warning");
    return;
  }

  if (grupo.sorteio) {
    iniciarAnimacaoDaAtribuicao(grupo.id);
    return;
  }

  const participantesComEmailInvalido = validarEmailsDoGrupo();
  if (participantesComEmailInvalido.length) {
    showToast(
      `Corrija o e-mail inválido de: ${participantesComEmailInvalido.join(", ")}.`,
      "warning"
    );
    lista.querySelector(".email-participante-input[aria-invalid='true']")?.focus();
    return;
  }

  const nomesConfirmados = [...participantes];
  showToast(
    `Sortear ${participantes.length} participantes do grupo "${grupo.nome}"? O resultado será salvo neste navegador e não poderá ser substituído.`,
    "warning",
    [
      {
        label: "Sortear",
        executar: () => confirmarSorteio(grupo.id, nomesConfirmados),
      },
      { label: "Cancelar", executar: () => {} },
    ],
    10000
  );
}

function confirmarSorteio(idGrupo, nomesConfirmados) {
  const grupo = state.grupos.find(item => item.id === idGrupo);
  if (!grupo) {
    showToast("O grupo não foi encontrado. Selecione um grupo e tente novamente.", "error");
    return;
  }
  if (acaoEmAndamento) {
    showToast("Aguarde a conclusão da ação em andamento.", "warning");
    return;
  }
  if (state.grupoSelecionado !== idGrupo) {
    showToast("O grupo selecionado mudou. Inicie o sorteio novamente.", "warning");
    return;
  }
  if (
    participantes.length !== nomesConfirmados.length ||
    participantes.some((nome, indice) => nome !== nomesConfirmados[indice])
  ) {
    showToast("A lista de participantes mudou. Inicie o sorteio novamente.", "warning");
    return;
  }
  if (grupo.sorteio) {
    showToast("Este grupo já possui um sorteio iniciado.", "warning");
    return;
  }

  const participantesComEmailInvalido = validarEmailsDoGrupo();
  if (participantesComEmailInvalido.length) {
    showToast(
      `Corrija o e-mail inválido de: ${participantesComEmailInvalido.join(", ")}.`,
      "warning"
    );
    lista.querySelector(".email-participante-input[aria-invalid='true']")?.focus();
    return;
  }

  let destinos;
  let possuiAutoAtribuicao;
  do {
    destinos = [...participantes];
    for (let indice = destinos.length - 1; indice > 0; indice -= 1) {
      const outroIndice = Math.floor(Math.random() * (indice + 1));
      [destinos[indice], destinos[outroIndice]] = [
        destinos[outroIndice],
        destinos[indice],
      ];
    }
    possuiAutoAtribuicao = participantes.some(
      (nome, indice) => nome === destinos[indice]
    );
  } while (possuiAutoAtribuicao);

  grupo.sorteio = {
    atribuicoes: participantes.map((nome, indice) => ({
      nome,
      sorteado: destinos[indice],
    })),
    processadas: 0,
  };
  salvarEstado();
  iniciarAnimacaoDaAtribuicao(idGrupo);
}

function iniciarAnimacaoDaAtribuicao(idGrupo) {
  const grupo = state.grupos.find(item => item.id === idGrupo);
  if (
    !grupo ||
    state.grupoSelecionado !== idGrupo ||
    !grupo.sorteio ||
    acaoEmAndamento
  ) {
    showToast(
      "Não foi possível iniciar o próximo sorteio. Verifique o grupo selecionado.",
      "warning"
    );
    return;
  }

  const atribuicoes = sorteioValido(grupo.sorteio, grupo.participantes);
  if (!atribuicoes) {
    showToast(
      "As atribuições deste sorteio são inválidas. O sorteio não foi avançado.",
      "error"
    );
    return;
  }
  const indiceAtribuicao = grupo.sorteio.processadas;
  const atribuicao = atribuicoes[indiceAtribuicao];
  if (!atribuicao) {
    showToast("Todos os sorteios individuais já foram processados.", "info");
    return;
  }

  const anguloPorFatia = 360 / participantes.length;
  const indiceDaDivisao = Math.floor(Math.random() * participantes.length);
  const anguloFinalModulo = indiceDaDivisao * anguloPorFatia;
  const giroAdicional =
    (anguloFinalModulo - ((rotacaoRoleta % 360) + 360) % 360 + 360) % 360;
  const rotacaoInicial = rotacaoRoleta;
  const rotacaoFinal = rotacaoInicial + 6 * 360 + giroAdicional;

  rotacaoFinalRoleta = rotacaoFinal;
  roletaGirando = true;
  palcoRoleta.classList.remove("sorteio-finalizado");
  definirAcaoEmAndamento(true);
  let inicio = null;
  const falharAnimacao = erro => {
    console.error("O giro da roleta foi interrompido.", erro);
    rotacaoFinalRoleta = null;
    roletaGirando = false;
    definirAcaoEmAndamento(false);
    resumoNotificacoes.textContent =
      "O giro foi interrompido. Nenhuma nova atribuição foi marcada como processada; tente novamente.";
    showToast("O giro foi interrompido. Tente novamente.", "error");
  };
  function animar(timestamp) {
    let progresso;
    try {
      if (inicio === null) {
        inicio = timestamp;
      }
      progresso = Math.min((timestamp - inicio) / DURACAO_ROLETA, 1);
      const desaceleracao = 1 - Math.pow(1 - progresso, 4);
      rotacaoRoleta =
        rotacaoInicial + (rotacaoFinal - rotacaoInicial) * desaceleracao;
      canvasRoleta.style.transform = `rotate(${rotacaoRoleta}deg)`;

      if (progresso < 1) {
        window.requestAnimationFrame(animar);
        return;
      }
    } catch (erro) {
      falharAnimacao(erro);
      return;
    }

    rotacaoRoleta = rotacaoFinal;
    grupo.sorteio.processadas = indiceAtribuicao + 1;
    const salvo = salvarEstado();
    rotacaoFinalRoleta = null;
    roletaGirando = false;
    definirAcaoEmAndamento(false);
    palcoRoleta.classList.add("sorteio-finalizado");
    const concluidos = grupo.sorteio.processadas;
    const total = grupo.sorteio.atribuicoes.length;
    resumoNotificacoes.textContent = salvo
      ? concluidos === total
        ? "Sorteio concluído e salvo neste navegador."
        : `Sorteio ${concluidos} de ${total} concluído e salvo.`
      : "A etapa foi processada, mas não foi possível salvar o progresso neste navegador.";
  }

  try {
    window.requestAnimationFrame(animar);
  } catch (erro) {
    falharAnimacao(erro);
  }
}

function criarCorpoDoEmail(nomeSorteado) {
  return `🎄 A MISSÃO SECRETA COMEÇOU!

E aí?! Preparado(a) para entrar nessa brincadeira? 😎🎁

O sorteio foi realizado e chegou a hora de descobrir quem é a pessoa que você vai surpreender!

🥁 TCHARAAAM... rufem os tambores! 🥁

🎉 VOCÊ TIROU:

🎁 ${nomeSorteado} 🎁

Agora começa a parte mais divertida: pensar em um presente especial, preparar uma surpresa e guardar esse segredo até o grande dia! 🤐✨

🤫 ALGUMAS REGRAS DA MISSÃO:

- 🚨 Não conte para ninguém quem você tirou!
- 🎁 Capriche na criatividade e escolha o presente com carinho.
- 😎 Mantenha o mistério até a hora da revelação.
- ❤️ Entre no clima e divirta-se!

Que essa brincadeira renda boas risadas, surpresas incríveis e momentos inesquecíveis!

O segredo está com você. A diversão está com todo mundo! 🥳🎄

Um abraço e boa sorte na missão!

🎅 Equipe do Amigo Secreto 🎁`;
}

function obterEmailDaAtribuicao(indice) {
  const grupo = getGrupoSelecionado();
  const atribuicao = grupo?.sorteio?.atribuicoes[indice];
  if (!grupo || !atribuicao) {
    return null;
  }

  const destinatario = String(emails.get(atribuicao.nome) || "").trim();
  if (!EMAIL_PATTERN.test(destinatario) || destinatario.length > 254) {
    const aviso = `Adicione um e-mail válido para ${atribuicao.nome} antes de preparar a mensagem.`;
    avisoEmailPendente = {
      idGrupo: grupo.id,
      nomeParticipante: atribuicao.nome,
      mensagem: aviso,
    };
    resumoNotificacoes.textContent = aviso;
    lista.querySelectorAll(".email-participante-input").forEach(input => {
      if (participantes[Number(input.dataset.index)] === atribuicao.nome) {
        input.focus();
      }
    });
    return null;
  }

  limparAvisoEmailPendente(grupo.id, atribuicao.nome);
  return {
    destinatario,
    assunto: EMAIL_SUBJECT,
    corpo: criarCorpoDoEmail(atribuicao.sorteado),
  };
}

function abrirEmailPreparado(indice) {
  const email = obterEmailDaAtribuicao(indice);
  if (!email) {
    return;
  }

  const url =
    `mailto:${encodeURIComponent(email.destinatario)}` +
    `?subject=${encodeURIComponent(email.assunto)}` +
    `&body=${encodeURIComponent(email.corpo.replace(/\r?\n/g, "\r\n"))}`;
  window.location.href = url;
  resumoNotificacoes.textContent =
    "Rascunho solicitado ao aplicativo de e-mail. Revise e envie manualmente; o navegador não confirma abertura nem entrega. Se nada abrir, copie a mensagem.";
}

function mostrarFallbackDeEmail() {
  textoFallbackEmail.value = "";
  fallbackEmail.hidden = true;
  resumoNotificacoes.textContent =
    "Não foi possível copiar automaticamente. Use “Preparar rascunho” para abrir a mensagem no aplicativo de e-mail e revise antes de enviar.";
}

function copiarEmailPreparado(indice) {
  const email = obterEmailDaAtribuicao(indice);
  if (!email) {
    return;
  }

  const mensagemCompleta =
    `Para: ${email.destinatario}\nAssunto: ${email.assunto}\n\n${email.corpo}`;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(mensagemCompleta).then(
      () => {
        resumoNotificacoes.textContent =
          "Mensagem copiada. Cole-a no seu aplicativo de e-mail, revise e envie manualmente.";
      },
      erro => {
        console.error("Não foi possível copiar a mensagem de e-mail.", erro);
        mostrarFallbackDeEmail();
      }
    );
    return;
  }

  mostrarFallbackDeEmail();
}

function tratarImagemDoGrupo(evento) {
  const arquivo = evento.target.files?.[0];
  const grupo = getGrupoSelecionado();
  if (!grupo) {
    return;
  }

  if (!arquivo) {
    atualizarStatusImagem(grupo);
    return;
  }

  atualizarStatusImagem(grupo, `Imagem selecionada: ${arquivo.name}`);

  if (!String(arquivo.type || "").startsWith("image/")) {
    showToast("Selecione um arquivo de imagem válido.", "warning");
    evento.target.value = "";
    atualizarStatusImagem(grupo);
    return;
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    showToast("A imagem deve ter até 5 MB para ser armazenada.", "warning");
    evento.target.value = "";
    atualizarStatusImagem(grupo);
    return;
  }

  const leitor = new FileReader();
  leitor.onload = () => {
    if (typeof leitor.result !== "string" || !leitor.result) {
      showToast("Não foi possível aplicar a imagem selecionada.", "error");
      evento.target.value = "";
      atualizarStatusImagem(getGrupoSelecionado());
      return;
    }

    const imagem = new Image();
    imagem.onload = () => {
      grupo.imagemFundo = leitor.result;
      nomesImagensAplicadas.set(grupo.id, arquivo.name);
      const salvo = salvarEstado();
      renderizarImagemDeFundo();
      if (getGrupoSelecionado()?.id === grupo.id) {
        atualizarStatusImagem(grupo);
      }
      evento.target.value = "";
      showToast(
        salvo
          ? `Imagem aplicada: ${arquivo.name}`
          : "A imagem foi aplicada nesta sessão, mas não foi possível salvá-la neste navegador.",
        salvo ? "success" : "warning"
      );
    };
    imagem.onerror = () => {
      console.error("A imagem selecionada não pôde ser decodificada.");
      evento.target.value = "";
      atualizarStatusImagem(getGrupoSelecionado());
      showToast("Não foi possível aplicar a imagem selecionada.", "error");
    };
    imagem.src = leitor.result;
  };
  leitor.onerror = () => {
    console.error("Não foi possível ler a imagem selecionada.");
    evento.target.value = "";
    atualizarStatusImagem(getGrupoSelecionado());
    showToast("Não foi possível ler a imagem selecionada.", "error");
  };
  try {
    leitor.readAsDataURL(arquivo);
  } catch (erro) {
    console.error("Não foi possível iniciar a leitura da imagem.", erro);
    evento.target.value = "";
    atualizarStatusImagem(getGrupoSelecionado());
    showToast("Não foi possível ler a imagem selecionada.", "error");
  }
}

function removerImagemDoGrupo() {
  const grupo = getGrupoSelecionado();
  if (!grupo || acaoEmAndamento) {
    return;
  }

  if (!grupo.imagemFundo) {
    showToast("Nenhuma imagem de fundo encontrada.", "info");
    return;
  }

  grupo.imagemFundo = null;
  nomesImagensAplicadas.delete(grupo.id);
  inputImagem.value = "";
  const salvo = salvarEstado();
  renderizarImagemDeFundo();
  atualizarStatusImagem(grupo);
  showToast(
    salvo
      ? "Imagem de fundo removida"
      : "Imagem removida nesta sessão, mas não foi possível salvar a alteração.",
    salvo ? "success" : "warning"
  );
}

function inicializarEventos() {
  const listaGrupos = document.getElementById("listaGrupos");
  const formGrupo = document.getElementById("formGrupo");
  const nomeGrupoInput = document.getElementById("nomeGrupo");
  const cancelarGrupoButton = document.getElementById("cancelarGrupo");
  const grupoButton = document.getElementById("novoGrupo");

  nomeInput.addEventListener("keydown", evento => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      adicionarParticipante();
    }
  });
  emailInput.addEventListener("keydown", evento => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      adicionarParticipante();
    }
  });
  nomeInput.addEventListener("input", () => {
    document.getElementById("erroParticipante").textContent = "";
  });
  emailInput.addEventListener("input", () => {
    document.getElementById("erroParticipante").textContent = "";
  });
  add.addEventListener("click", adicionarParticipante);

  lista.addEventListener("click", evento => {
    const botao = evento.target.closest(".remover-participante");
    if (botao) {
      removerParticipante(Number(botao.dataset.index));
    }
  });
  lista.addEventListener("input", evento => {
    const input = evento.target.closest(".email-participante-input");
    if (input) {
      input.removeAttribute("aria-invalid");
      document.getElementById("erroParticipante").textContent = "";
      const nome = participantes[Number(input.dataset.index)];
      if (nome) {
        const email = input.value.trim();
        emails.set(nome, email);
        if (EMAIL_PATTERN.test(email) && email.length <= 254) {
          limparAvisoEmailPendente(getGrupoSelecionado()?.id, nome);
        }
        sincronizarEstadoDoGrupo();
        salvarEstado();
      }
    }
  });

  botaoSortear.addEventListener("click", iniciarSorteio);
  listaEmailsPreparados.addEventListener("click", evento => {
    const botao = evento.target.closest("button[data-index]");
    if (!botao) {
      return;
    }

    const indice = Number(botao.dataset.index);
    if (botao.classList.contains("preparar-email")) {
      abrirEmailPreparado(indice);
    } else if (botao.classList.contains("copiar-email")) {
      copiarEmailPreparado(indice);
    }
  });

  listaGrupos.addEventListener("click", evento => {
    const botao = evento.target.closest("button[data-acao]");
    if (!botao || acaoEmAndamento) {
      return;
    }

    const { acao, id } = botao.dataset;
    if (acao === "selecionar") {
      selecionarGrupo(id);
    } else if (acao === "editar") {
      iniciarEdicaoDeGrupo(id);
    } else if (acao === "excluir") {
      excluirGrupo(id);
    }
  });

  formGrupo.addEventListener("submit", salvarGrupo);
  nomeGrupoInput.addEventListener("input", () => {
    document.getElementById("erroGrupo").textContent = "";
  });
  cancelarGrupoButton.addEventListener("click", resetarFormularioGrupo);
  grupoButton.addEventListener("click", () => {
    resetarFormularioGrupo();
    document.getElementById("nomeGrupo").focus();
  });
  document.getElementById("removerImagem").addEventListener("click", removerImagemDoGrupo);
  inputImagem.addEventListener("change", tratarImagemDoGrupo);
}

document.addEventListener("DOMContentLoaded", () => {
  carregarEstado();
  inicializarEventos();
  renderizarListaGrupos();
  renderizarGrupoAtual();
});
