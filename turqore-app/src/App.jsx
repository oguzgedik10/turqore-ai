import { useState, useRef, useEffect } from "react";
import "./App.css";

function App() {
  const [chats, setChats] = useState([
    {
      id: 1,
      title: "Yeni Analiz",
      messages: [{ sender: "Turqore", text: "Merhaba Oğuz! Yepyeni yerleşim düzenimiz aktif. Bugün neyi analiz ediyoruz?" }]
    }
  ]);
  
  const [activeChatId, setActiveChatId] = useState(1);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedModel, setSelectedModel] = useState("genius"); // fast, balanced, genius
  const [showModelMenu, setShowModelMenu] = useState(false); // Model dropdown kontrolü
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const modelMenuRef = useRef(null); // Model menüsünün nerede olduğunu referans almak için

  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

  // Otomatik kaydırma mekanizması
  useEffect(() => {
    // Eğer referansımız varsa ve aktif sohbet değişmişse/mesaj gelmişse
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: "smooth", 
        block: "end" // Mesajın bitiş noktasını baz al
      });
    }
  }, [activeChat?.messages, isLoading]); // Mesajlar veya 'analiz ediliyor' durumu değişince tetikle

  // Menü dışına tıklanınca model seçiciyi otomatik kapatma mekanizması
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target)) {
        setShowModelMenu(false);
      }
    };

    if (showModelMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showModelMenu]);

  // Model ismini Türkçeleştirme (Emoji kaldırıldı, Dahi eklendi)
  const getModelLabel = () => {
    if (selectedModel === "fast") return "Hızlı";
    if (selectedModel === "balanced") return "Dengeli";
    return "Dahi";
  };

  const handleNewChat = () => {
    const newId = Date.now();
    const newChat = {
      id: newId,
      title: `Yeni Sohbet #${chats.length + 1}`,
      messages: [{ sender: "Turqore", text: "Yeni bir sohbete başladık. Dosya ekleyebilir veya soru sorabilirsin." }]
    };
    setChats([newChat, ...chats]);
    setActiveChatId(newId);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Yükleniyor durumunu ekle
      setChats(prev => prev.map(chat => 
        chat.id === activeChatId 
        ? { ...chat, messages: [...chat.messages, { sender: "Sistem", text: `⏳ ${file.name} motorlara aktarılıyor...` }] }
        : chat
      ));
      
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("http://127.0.0.1:5000/api/upload", {
          method: "POST",
          body: formData
        });
        const data = await response.json();
        
        setChats(prev => prev.map(chat => 
          chat.id === activeChatId 
          ? { ...chat, messages: [...chat.messages, { sender: "Sistem", text: `📁 ${file.name} dökümanı mühürlendi ve analiz edildi.` }] }
          : chat
        ));
      } catch (error) {
        setChats(prev => prev.map(chat => 
          chat.id === activeChatId 
          ? { ...chat, messages: [...chat.messages, { sender: "Sistem", text: `❌ ${file.name} aktarılamadı: Motora ulaşılamadı.` }] }
          : chat
        ));
      }
      e.target.value = ""; 
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    
    setChats(prev => prev.map(chat => {
      if (chat.id === activeChatId) {
        const newTitle = chat.messages.length === 1 ? userMessage.substring(0, 20) + "..." : chat.title;
        return { ...chat, title: newTitle, messages: [...chat.messages, { sender: "Siz", text: userMessage }] };
      }
      return chat;
    }));
    setInput("");
    setIsLoading(true);

    // Sisteme gönderilecek olan mesaj geçmişini hazırla
    const chatHistory = activeChat.messages.map(msg => ({
      sender: msg.sender,
      text: msg.text
    }));

    try {
      const response = await fetch("http://127.0.0.1:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: userMessage,
          model: selectedModel,
          // Geçmişi API'ye yolluyoruz ki önceki konuştuklarımızı hatırlasın
          history: chatHistory
        })
      });
      const data = await response.json();

      if (data.reply) {
        setChats(prevChats => prevChats.map(chat => 
          chat.id === activeChatId 
          ? { ...chat, messages: [...chat.messages, { sender: "Turqore", text: data.reply }] }
          : chat
        ));
      }
    } catch (error) {
      setChats(prevChats => prevChats.map(chat => 
        chat.id === activeChatId 
        ? { ...chat, messages: [...chat.messages, { sender: "Turqore", text: "⚠️ Motora ulaşılamadı." }] }
        : chat
      ));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <aside className={`sidebar ${isSidebarOpen ? "open" : "closed"}`}>
        <div className="logo">Turqore<span>.ai</span></div>
        <div className="history-section">
          <p className="history-title">Sohbet Geçmişi</p>
          {chats.map(chat => (
            <div 
              key={chat.id} 
              className={`history-item ${chat.id === activeChatId ? "active" : ""}`}
              onClick={() => setActiveChatId(chat.id)}
            >
              {chat.title}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <p>© 2026 Turqore Engine</p>
        </div>
      </aside>

      <main className="chat-area">
        <header className="top-bar">
          <div className="top-bar-left">
            <button className="toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              {isSidebarOpen ? "◀" : "☰"} 
            </button>
            <span className="top-bar-title">{activeChat.title}</span>
          </div>
          <button className="new-chat-top-btn" onClick={handleNewChat}>
            <span>+</span> Yeni Sohbet
          </button>
        </header>

        <div className="messages-container">
          <div className="messages">
            {/* OTO-ANİMASYON FİXİ: key değerine chat.id ekledik, böylece sohbet değişince animasyonlar tekrar oynar */}
            {activeChat?.messages?.map((msg, idx) => (
              <div key={`${activeChat.id}-${idx}`} className={`message ${msg.sender === "Siz" ? "user" : msg.sender === "Sistem" ? "system" : "bot"}`}>
                {msg.text}
              </div>
            ))}
            {isLoading && <div className="message bot loading-msg">Analiz ediliyor...</div>}
            <div ref={messagesEndRef} />
          </div>
        </div>
        
        <div className="input-wrapper">
          <div className="input-area">
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{display: 'none'}} 
              onChange={handleFileUpload}
            />
            <button className="attach-btn" onClick={() => fileInputRef.current.click()}>+</button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault(); // İleride textarea yaparsan alt satıra inme bug'ını şimdiden çözer
                  handleSend();
                }
              }}
              placeholder="Bir şey sor veya döküman ekle..."
            />
            <div className="model-dropdown-container" ref={modelMenuRef}>
              <button className="model-select-trigger" onClick={() => setShowModelMenu(!showModelMenu)}>
                {getModelLabel()} <span className="arrow-down">∨</span>
              </button>
              {showModelMenu && (
                <div className="model-menu">
                  {/* Emojiler silindi, Dahi eklendi */}
                  <button onClick={() => {setSelectedModel("fast"); setShowModelMenu(false)}}>Hızlı</button>
                  <button onClick={() => {setSelectedModel("balanced"); setShowModelMenu(false)}}>Dengeli</button>
                  <button onClick={() => {setSelectedModel("genius"); setShowModelMenu(false)}}>Dahi</button>
                </div>
              )}
            </div>
            <button className="send-btn" onClick={handleSend} disabled={isLoading}>
              <span className="send-icon">➤</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;