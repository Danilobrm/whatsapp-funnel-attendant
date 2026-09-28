const ptBR = {
  common: {
    appName: 'Attendant',
    send: 'Enviar',
    ask: 'Escreva uma mensagem',
    themeToggle: 'Alternar tema',
  },
  sidebar: {
    simulator: 'Simulador',
    settings: 'Atendente',
  },
  chat: {
    thinking: 'Digitando',
    error: 'Falha ao enviar a mensagem. Tente novamente.',
    // UX por code devolvido pelo backend — o `message` cru do servidor nunca
    // é exibido. Ver `.claude/rules/error-handling.md`.
    errors: {
      text_required: 'Escreva uma mensagem antes de enviar.',
      text_too_long: 'Mensagem longa demais.',
    },
    commands: {
      title: 'Comandos',
      placeholder: 'Escreva como um cliente ou digite / para comandos',
      reset: {
        label: '/reiniciar',
        description: 'Apagar esta conversa de teste e começar do zero',
      },
    },
  },
  simulator: {
    title: 'Simulador',
    subtitle:
      'Converse como se fosse um cliente no WhatsApp. É o mesmo atendente que responde lá.',
    empty: 'Mande um "oi" para começar.',
    loadError: 'Não foi possível carregar a conversa de teste.',
    resetDone: 'Conversa apagada. Pode começar de novo.',
    resetError: 'Não foi possível apagar a conversa.',
    provider: {
      persona: 'Texto fixo da persona',
      agent: 'Gerado pela IA',
    },
  },
  settings: {
    title: 'Atendente',
    subtitle: 'Defina a persona, o gênero e os idiomas do atendente.',
    identity: {
      title: 'Identidade',
      subtitle: 'Nome e gênero com que o bot se apresenta.',
    },
    name: {
      label: 'Nome do bot',
      placeholder: 'Ex.: Nina',
      hint: 'Aparece na saudação. Até 60 caracteres.',
    },
    gender: {
      title: 'Gênero',
      subtitle: 'Define a concordância nos textos escritos pelo bot.',
      neutral: {
        title: 'Neutro',
        description: 'Sem marcação: "atendente virtual".',
      },
      female: {
        title: 'Feminino',
        description: 'Concorda no feminino: "a atendente virtual".',
      },
      male: {
        title: 'Masculino',
        description: 'Concorda no masculino: "o atendente virtual".',
      },
    },
    personality: {
      title: 'Personalidade',
      subtitle:
        'Tom do atendente: vale para os textos fixos (saudação, "não entendi") e para as respostas da IA.',
      friendly: {
        title: 'Amigável',
        description: 'Próximo e acolhedor, com linguagem informal.',
      },
      formal: {
        title: 'Formal',
        description: 'Cordial e impessoal, sem gírias.',
      },
      objective: {
        title: 'Objetivo',
        description: 'Direto ao ponto, sem preâmbulo.',
      },
      technical: {
        title: 'Técnico',
        description:
          'Preciso; pede os detalhes que faltam (itens, quantidades, endereço).',
      },
    },
    languages: {
      title: 'Idiomas',
      subtitle: 'Idiomas em que o atendente conversa com os clientes.',
      active: 'Ativo',
      locked: 'Único idioma disponível por enquanto.',
      'pt-BR': {
        label: 'Português (Brasil)',
        description: 'Idioma padrão do atendente.',
      },
    },
    preview: {
      title: 'Prévia',
      subtitle:
        'Como o bot fala com a configuração salva. Atualiza ao sincronizar.',
      greeting: 'Saudação',
      identity: 'Quando perguntam quem ele é',
      fallback: 'Quando não consegue ajudar',
      junk: 'Não entendi',
    },
    scope:
      'Saudação, identidade e "não entendi" saem destes textos fixos, sem IA. O resto da conversa é da IA, seguindo o mesmo tom.',
    sync: {
      pending: 'Alterações não salvas...',
      syncing: 'Salvando...',
      synced: 'Salvo',
    },
    loadError: 'Não foi possível carregar a configuração do atendente.',
    errors: {
      generic: 'Não foi possível salvar. Tente novamente.',
      name_required: 'Informe o nome do bot.',
      name_too_long: 'O nome do bot passa de 60 caracteres.',
      unknown_personality: 'Personalidade inválida.',
      unknown_gender: 'Gênero inválido.',
      languages_required: 'Selecione pelo menos um idioma.',
      unsupported_language: 'Idioma ainda não suportado pelo backend.',
    },
  },
  login: {
    title: 'Área administrativa',
    subtitle: 'Entre para acessar o painel do atendente.',
    email: 'E-mail',
    emailPlaceholder: 'voce@empresa.com',
    password: 'Senha',
    submit: 'Entrar',
    submitting: 'Entrando...',
    logout: 'Sair',
    // Uma chave por code devolvido pelo backend. `generic` cobre code novo que
    // o frontend ainda não conhece — t() devolveria a própria chave crua.
    errors: {
      generic: 'Não foi possível entrar. Tente novamente.',
      invalid_credentials: 'E-mail ou senha inválidos.',
      rate_limited: 'Muitas tentativas. Aguarde alguns instantes.',
      network: 'Falha de conexão com o servidor.',
      session_expired: 'Sua sessão expirou. Entre novamente.',
    },
  },
  account: {
    menuLabel: 'Menu da conta',
    signedInAs: 'Conectado como {email}',
    tenantLabel: 'Empresa',
    settingsItem: 'Configurações',
    settingsTitle: 'Configurações',
    settingsSubtitle: 'Preferências da sua sessão administrativa.',
    close: 'Fechar',
    language: {
      title: 'Idioma da interface',
      subtitle: 'Define o idioma do painel administrativo.',
      'pt-BR': 'Português (Brasil)',
      'en-US': 'English (US)',
    },
  },
} as const;

export default ptBR;
