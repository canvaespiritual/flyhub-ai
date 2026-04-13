export type Message = {
  id: number;
  from: "client" | "agent";
  text: string;
  time: string;
};

export const messagesByConversationId: Record<number, Message[]> = {
  1: [
    {
      id: 1,
      from: "client",
      text: "Oi, vi o anúncio e queria entender melhor.",
      time: "11:36",
    },
    {
      id: 2,
      from: "agent",
      text: "Perfeito. Me fala sua renda aproximada e se já tem algum valor de entrada.",
      time: "11:37",
    },
    {
      id: 3,
      from: "client",
      text: "Minha renda gira em torno de 4 mil e tenho pouca entrada.",
      time: "11:39",
    },
    {
      id: 4,
      from: "agent",
      text: "Ótimo, já consigo te direcionar melhor. Existem opções em obras com entrada parcelada que costumam encaixar bem nesse perfil.",
      time: "11:40",
    },
  ],
  2: [
    {
      id: 1,
      from: "client",
      text: "Oi, consegue me mandar algo em Samambaia?",
      time: "10:11",
    },
    {
      id: 2,
      from: "agent",
      text: "Consigo sim. Você busca apartamento com 2 quartos?",
      time: "10:13",
    },
    {
      id: 3,
      from: "client",
      text: "Isso, e queria ver se a entrada fica parcelada.",
      time: "10:16",
    },
  ],
  3: [
    {
      id: 1,
      from: "client",
      text: "Vi o anúncio, mas ainda estou analisando.",
      time: "Ontem",
    },
    {
      id: 2,
      from: "agent",
      text: "Sem problemas. Posso te mostrar uma opção que costuma encaixar bem nesse perfil.",
      time: "Ontem",
    },
    {
      id: 3,
      from: "client",
      text: "Vou pensar e te falo.",
      time: "Ontem",
    },
  ],
};