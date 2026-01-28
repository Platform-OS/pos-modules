import { Page, Locator } from '@playwright/test';
import { BasePage } from './page';

export class PeoplePage extends BasePage {
  readonly page: Page;
  readonly peopleList: PeopleList;

  constructor(page: Page) {
    super(page, '/')
    this.page = page;

    const peopleSectionLocator = this.page.locator('section.pos-chat-people');

    this.peopleList = new PeopleList(page, peopleSectionLocator);
  }

  async openChat(fullName: string) {
    return await this.peopleList.openChat(fullName);
  }

  async isPeopleCardVisible(fullName: string) {
    return await this.peopleList.isPeopleCardVisible(fullName);
  }
}

class PeopleCard {
  constructor(private page:Page, private listLocator: Locator) {}

  getCard() {
    return this.listLocator.locator('ul li');
  }

  getCardByFullName(author: string) {
    return this.getCard().getByText(author).locator('..');
  }

  isPeopleCardVisible(fullName: string) {
    const card = this.getCardByFullName(fullName);

    return card.isVisible();
  }
}
  
class PeopleList {
  private peopleCard: PeopleCard;

  constructor(private page: Page, private listLocator: Locator) {
    this.peopleCard = new PeopleCard(page, listLocator);
  }

  getCardByFullName(fullName: string) {
    return this.peopleCard.getCardByFullName(fullName);
  }

  openChat(fullName: string) {
    return this.getCardByFullName(fullName).click();
  }

  isPeopleCardVisible(fullName: string) {
    return this.peopleCard.isPeopleCardVisible(fullName);
  }
}

export class InboxPage extends BasePage {
  readonly page: Page;
  readonly chatList: ChatList;
  readonly chat: Chat;
  readonly message: MessageBox;
  readonly peoplePage: PeoplePage;

  constructor(page: Page) {
    super(page, '/inbox');
    this.page = page;

    const listLocator = this.page.locator('#pos-chat-conversations');
    const chatLocator = this.page.locator('#pos-chat-conversation');

    this.chatList = new ChatList(page, listLocator);
    this.chat = new Chat(page, chatLocator);
    this.message = new MessageBox(page);
    this.peoplePage = new PeoplePage(page);
  }

  async sendMessage(fullName: string, text: string) {
    await this.peoplePage.peopleList.openChat(fullName);
    if (text != '') {
      return await this.chat.sendMessage(text);
    }
  } 
  
  async sendMessages(fullName: string, messages: string[]) {
    await this.peoplePage.peopleList.openChat(fullName);
    return await this.chat.sendMessages(messages);
  } 

  async isChatOpened(author: string) {
    await this.peoplePage.peopleList.openChat(author);
    const isAuthorHeaderVisible = await this.page.locator('header').getByText(author).isVisible();

    return isAuthorHeaderVisible;
  }
}

class ChatCard {
  constructor(private page: Page, private listLocator: Locator) {}

  getCard() {
    return this.listLocator.locator('.pos-chat-conversationCard');
  }

  getLastMessage(author: string) {
    return this.getCardByAuthor(author).locator('small');
  }

  getLastMessageDate(author: string) {
    return this.getCardByAuthor(author).locator('time');
  }

  getCardByAuthor(author: string) {
    return this.getCard().locator('.pos-chat-conversationCard-name').getByText(author).locator('..');
  }
}

class ChatList {
  private chatCard: ChatCard;

  constructor(private page: Page, private listLocator: Locator) {
    this.chatCard = new ChatCard(page, listLocator);
  }

  getCardByAuthor(author: string) {
    return this.chatCard.getCard().locator('.pos-chat-conversationCard-name').getByText(author).locator('..');
  }

  getCardLastMessage(author: string) {
    return this.chatCard.getLastMessage(author);
  }

  getCardLastMessageDate(author: string) {
    return this.chatCard.getLastMessageDate(author);
  }

  openCard(author: string) {
    return this.getCardByAuthor(author).click();
  }

  countCards() {
    return this.chatCard.getCard().count();
  }

  async readAllConversations(conversations: { fullName: string }[]) {
    for (const conversation of conversations) {
      await this.openCard(conversation.fullName);
    }
  }  

  async isChatCardVisible(text: string) {
    const chatCard = this.getCardByAuthor(text);
    const isVisible = await chatCard.isVisible();

    return isVisible;
  }
}

class MessageBox {
  constructor(private page: Page) {}

  getMessage(type?: string): Locator {
    if (type === 'received') return this.page.locator('li.pos-chat-message:not(.pos-chat-message-authored) div');
    if (type === 'sent') return this.page.locator('li.pos-chat-message.pos-chat-message-authored div');
    return this.page.locator('div.pos-chat-message-content');
  }

  getMessageByIndex(index: number): Locator {
    return this.getMessage().nth(index);
  }

  getMessageByText(text: string, type?: string): Locator {
    return this.getMessage(type).getByText(text);
  }

  //getMessageDate(text: string): Promise<string> {
  //  return this.getMessageByText(text).locator('..').locator('time').innerText();
  //}

  countMessages(type?: string) {
    if (type === "sent") return this.countSentMessageBox();
    if (type === "received") return this.countReceivedMessageBox();
    return this.countMessages();
  }

  countSentMessageBox() {
    return this.getMessage('sent').count();
  }

  countReceivedMessageBox() {
    return this.getMessage('received').count();
  }
  
  async isMessageVisible(text: string) {
    const message = this.getMessageByText(text);
    const isVisible = await message.isVisible();

    return isVisible;
  }

  async isMessageSent(text: string) {
    const message = await this.getMessage('sent').innerText();
    const isMessageVisible = await this.isMessageVisible(text);

    if (isMessageVisible && message === text) {
      return true;
    }
  }

  async isMessageReceived(text: string) {
    const message = await this.getMessage('received').innerText();
    const isMessageVisible = await this.isMessageVisible(text);

    if (isMessageVisible && message === text) {
      return true;
    }
  }
}

class Chat {
  readonly header: (text: string) => Locator;
  readonly messageBox: MessageBox;
  readonly messageInputField: Locator;
  readonly messageInputFieldEnabled: Locator;
  private buttonWithText: (text: string) => Locator;

  constructor(private page: Page, private chatLocator: Locator) {
    this.header = (text: string) => chatLocator.locator('header').getByText(text);
    this.messageBox = new MessageBox(page);
    this.messageInputField = chatLocator.locator('#chat-messageInput');
    this.messageInputFieldEnabled = chatLocator.locator('#chat-messageInput:not([disabled])');
    this.buttonWithText = (text: string) => page.getByRole('button', { name: text, exact: true });
  }

  async sendMessage(text: string) {
    if(await this.messageInputField.isVisible()) {
      await this.messageInputFieldEnabled.waitFor();
    }
    await this.messageInputField.click();
    await this.messageInputField.pressSequentially(text, { delay: 10 });
    await this.buttonWithText('Send').click();
    await this.messageBox.getMessageByText(text, 'sent').waitFor();
    return this.messageBox.isMessageVisible(text);
  }

  async sendMessages(messages: string[]) {
    const sentMessages = [];
  
    for (const text of messages) {
      const sent = await this.sendMessage(text);
      sentMessages.push(sent);
    }
  
    return sentMessages.every((result) => result === true);
  }

  async verifyMessageOrder(expectedMessages: string[]) {
    for (let i = 0; i < expectedMessages.length; i++) {
      const messageByIndex = await this.messageBox.getMessageByIndex(i);
      const text = await messageByIndex.innerText();
      if (text !== expectedMessages[i]) {
        return false;
      }
    }
    return true;
  }  
}
