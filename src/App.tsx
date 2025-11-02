'use client'; 

import React, { useState, useEffect, useCallback } from 'react';
import { Send, ChevronLeft, LogOut, Clock, Target, Calendar } from 'lucide-react';

// --- 0. ГЛОБАЛЬНОЕ ОБЪЯВЛЕНИЕ ТИПА ДЛЯ TELEGRAM (ИСПРАВЛЕНИЕ ОШИБКИ) ---
// Это позволит TypeScript корректно распознавать window.Telegram
declare global {
    interface Window {
        Telegram: {
            WebApp: {
                initDataUnsafe?: {
                    user?: {
                        id: number;
                    };
                };
                // Добавьте другие свойства WebApp, если они будут использоваться
            };
        };
    }
}
// -------------------------------------------------------------------

// Объявление типа для process.env, чтобы избежать ошибки "Не удается найти имя 'process'"
// это безопасно для клиентского кода, так как мы лишь указываем тип, а не полагаемся на Node runtime
declare const process: {
    env: {
        NODE_ENV?: string;
    };
};


// --- 1. ТИПЫ ДАННЫХ ДЛЯ TYPESCRIPT ---
// Определяем типы для данных, которые мы получаем из PostgreSQL через API
interface UserProfile {
    telegram_id: number;
    name: string;
    goal: 'gain' | 'loss' | 'maintain';
    meal_frequency: string;
    target_calories: number;
    target_protein: number;
    target_fat: number;
    target_carbs: number;
    weight: number;
    age: number;
    gender: 'male' | 'female';
    is_subscribed: number;
}

interface ProfileCardProps {
    icon: React.ReactElement<React.SVGProps<SVGSVGElement>>;
    title: string;
    value: string;
    color: string;
}

interface Message {
    id: number;
    text: string;
    sender: 'user' | 'trainer';
}

// --- 2. КОМПОНЕНТ ProfileCard ---
const ProfileCard: React.FC<ProfileCardProps> = ({ icon, title, value, color }) => (
  <div className="flex items-center p-3 bg-gray-50 rounded-lg shadow-sm">
    {/* ИСПРАВЛЕНИЕ: Используем React.cloneElement и явно передаем props */}
    {React.cloneElement(icon, { className: `w-6 h-6 mr-3 text-${color}-500` })} 
    <div>
      <p className="text-xs text-gray-500">{title}</p>
      <p className="font-semibold text-gray-800">{value}</p>
    </div>
  </div>
);

// --- 3. КОМПОНЕНТ ProfileView ---
interface ProfileViewProps {
    user: UserProfile | null;
    setView: (view: 'chat' | 'profile') => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ user, setView }) => {
    if (!user) {
        return <div className="p-4 text-center text-gray-500">Загрузка профиля...</div>;
    }

    const goalMap = {
        'gain': 'Набор Мышц 💪',
        'loss': 'Снижение Веса 🔥',
        'maintain': 'Поддержание 👌'
    };
    
    // Временно, пока не реализуем логику подписки
    const subscriptionStatus = user.is_subscribed === 1 ? 'PRO Активен' : 'Free План';

    return (
        <div className="p-4 bg-white min-h-screen">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-2">👤 Твой Профиль</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
                <ProfileCard 
                    icon={<Target />} 
                    title="Главная Цель" 
                    value={goalMap[user.goal] || user.goal} 
                    color="indigo" 
                />
                <ProfileCard 
                    icon={<Clock />} 
                    title="Частота Питания" 
                    value={user.meal_frequency} 
                    color="green" 
                />
                <ProfileCard 
                    icon={<Calendar />} 
                    title="Подписка" 
                    value={subscriptionStatus} 
                    color={user.is_subscribed === 1 ? "yellow" : "gray"}
                />
                <ProfileCard 
                    icon={<LogOut />} 
                    title="Выход" 
                    value="Сброс настроек" 
                    color="red" 
                />
            </div>
            
            <h3 className="text-xl font-semibold mb-4 text-gray-700">Твои Нормы КБЖУ</h3>
            <div className="space-y-2">
                <p className="text-lg">🔥 **Калории:** {user.target_calories} ккал</p>
                <p className="text-lg">🥩 **Белки:** {user.target_protein} г</p>
                <p className="text-lg">🥑 **Жиры:** {user.target_fat} г</p>
                <p className="text-lg">🍚 **Углеводы:** {user.target_carbs} г</p>
            </div>

            <div className="mt-8">
                <button 
                    onClick={() => setView('chat')} 
                    className="w-full bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 transition"
                >
                    Перейти в Чат с Тренером
                </button>
            </div>
        </div>
    );
};

// --- 4. КОМПОНЕНТ ChatView ---
interface ChatViewProps {
    user: UserProfile | null;
    setView: (view: 'chat' | 'profile') => void;
}

const ChatView: React.FC<ChatViewProps> = ({ user, setView }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // Формируем контекст для LLM
    const userContext = user 
        ? `Цель: ${user.goal}, Вес: ${user.weight} кг, Норма: Ккал=${user.target_calories}, Белки=${user.target_protein}, Жиры=${user.target_fat}, Углеводы=${user.target_carbs}.` 
        : "Данные пользователя недоступны.";

    // ИСПРАВЛЕНО: Теперь sendMessage принимает необязательный аргумент systemTrigger
    const sendMessage = useCallback(async (systemTrigger?: string) => {
        
        // Определяем, что отправлять: текст из поля ввода ИЛИ системный триггер
        const messageToSend = systemTrigger || input;
        
        // БЛОКИРУЕМ: если это не системный триггер и поле ввода пустое
        if (!messageToSend.trim() || !user) return; 

        // Если это пользовательское сообщение, добавляем его в историю
        if (!systemTrigger) {
            const newMessage: Message = { id: Date.now(), text: messageToSend, sender: 'user' };
            setMessages(prev => [...prev, newMessage]);
        }
        
        setInput('');
        setIsLoading(true);

        try {
            const history = messages.map(m => ({ 
                role: m.sender === 'user' ? 'user' : 'system', 
                text: m.text 
            })).slice(-10); // Ограничиваем историю чата

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // Если это системный триггер, отправляем его как основное сообщение.
                    message: systemTrigger || messageToSend, 
                    context: userContext,
                    chatHistory: history 
                }),
            });

            if (response.ok) {
                const data = await response.json();
                const trainerMessage: Message = { id: Date.now() + 1, text: data.text, sender: 'trainer' };
                setMessages(prev => [...prev, trainerMessage]);
            } else {
                const errorData = await response.json();
                const errorMessage: Message = { id: Date.now() + 1, text: `❌ Ошибка LLM: ${errorData.error}`, sender: 'trainer' };
                setMessages(prev => [...prev, errorMessage]);
            }
        } catch (error: unknown) { // ИСПРАВЛЕНО: Типизация ошибки
            console.error('Chat failed:', error);
            const errorMessage: Message = { id: Date.now() + 1, text: '❌ Ошибка сети или сервера.', sender: 'trainer' };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    }, [input, user, userContext, messages]); 

    // Эффект для автоматической прокрутки вниз
    useEffect(() => {
        const chatWindow = document.getElementById('chat-window');
        if (chatWindow) {
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    }, [messages]);
    
    // Эффект для приветственных вопросов (первый запуск LLM)
    useEffect(() => {
        // Запуск при загрузке данных пользователя и только если история пуста
        if (messages.length === 0 && user) { 
             const welcomeMessage: Message = { id: Date.now(), text: "Начинаем чат. Тренер задает первые вопросы:", sender: 'trainer' };
             
             // Добавляем сообщение-заголовок
             setMessages([welcomeMessage]); 
             
             // Отправляем специальный триггер в LLM для генерации 3 вопросов
             sendMessage('Задай пользователю три стартовых вопроса: про еду, аллергию и нелюбимые продукты, используя контекст его цели.'); 
        }
    }, [user, messages.length, sendMessage]); 

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <header className="flex items-center p-4 border-b bg-white shadow-sm">
                <button onClick={() => setView('profile')} className="mr-4 text-gray-600 hover:text-gray-800">
                    <ChevronLeft className="w-6 h-6"/>
                </button>
                <h1 className="text-lg font-semibold text-gray-800">💬 Чат с Тренером</h1>
            </header>

            {/* Chat Window */}
            <main id="chat-window" className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map(msg => (
                    <div 
                        key={msg.id} 
                        className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-xl shadow-md ${
                            msg.sender === 'user' 
                            ? 'bg-indigo-500 text-white rounded-br-none' 
                            : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'
                        }`}>
                            {/* Отображение текста */}
                            {msg.text}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white p-3 rounded-xl rounded-tl-none border border-gray-200 text-gray-500">
                            Печатает...
                        </div>
                    </div>
                )}
            </main>

            {/* Input Footer */}
            <footer className="p-4 border-t bg-white">
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Задай вопрос тренеру..."
                        className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={isLoading}
                    />
                    <button
                        onClick={() => sendMessage()}
                        className={`bg-indigo-600 text-white p-3 rounded-lg transition ${isLoading ? 'opacity-50' : 'hover:bg-indigo-700'}`}
                        disabled={isLoading}
                    >
                        <Send className="w-6 h-6" />
                    </button>
                </div>
            </footer>
        </div>
    );
};

// --- 5. ГЛАВНЫЙ КОМПОНЕНТ APP ---
const App = () => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [view, setView] = useState<'chat' | 'profile'>('chat');
    const [isLoadingProfile, setIsLoadingProfile] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // ВАЖНО: Определяем fetchProfile внутри App, чтобы его можно было вызвать.
    const fetchProfile = async (id: number) => {
        setIsLoadingProfile(true);
        setLoadError(null);
        try {
            const response = await fetch(`/api/profile?id=${id}`);
            if (!response.ok) {
                // Если статус 404/500, значит, либо не найден, либо ошибка БД
                throw new Error('Профиль не найден. Создай его в Telegram /start');
            }
            // ИСПРАВЛЕНИЕ: Явно приводим тип
            const userData: UserProfile = await response.json() as UserProfile; 
            setUser(userData);
        } catch (error) { // error теперь неявно 'unknown'
            const errorMessage = error instanceof Error 
                ? error.message 
                : 'Ошибка загрузки профиля.'; // Если это не Error, используем заглушку
            setLoadError(errorMessage);
        } finally {
            setIsLoadingProfile(false);
        }
    };
    
    // Эффект для получения ID пользователя из Telegram и загрузки профиля из БД
    useEffect(() => {
        // Функция для безопасного доступа к Telegram WebApp
        // ИСПРАВЛЕНИЕ ОШИБКИ: Теперь используем объявленный глобальный тип Window
        const getTelegramWebApp = () => {
            if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
                return window.Telegram.WebApp;
            }
            return null;
        };

        const checkTelegramInit = () => {
            // ВАЖНО: setIsLoadingProfile(true) уже стоит в fetchProfile, здесь не нужно.
            let attempts = 0;
            const maxAttempts = 20; // Ждем до 2 секунд (20 * 100 мс)

            const intervalId = setInterval(async () => {
                const telegramWebApp = getTelegramWebApp();
                const telegramId = telegramWebApp?.initDataUnsafe?.user?.id;
                
                // ВАЖНО: Используем заглушку только для Development
                if (process.env.NODE_ENV === 'development') {
                    clearInterval(intervalId);
                    await fetchProfile(1056878733); // Заглушка ID
                    return;
                }

                if (telegramId) {
                    clearInterval(intervalId);
                    // Если ID получен, вызываем функцию загрузки профиля
                    await fetchProfile(telegramId); 
                } else if (attempts >= maxAttempts) {
                    clearInterval(intervalId);
                    setIsLoadingProfile(false);
                    // Если таймаут, выводим ошибку, которую видит пользователь
                    setLoadError("Не удалось получить ID пользователя Telegram. Проверьте BotFather и способ запуска.");
                }
                
                attempts++;
            }, 100); // Проверяем каждые 100 мс
            
            // Очистка интервала при размонтировании
            return () => clearInterval(intervalId);
        };

        checkTelegramInit(); // Запускаем цикл проверки
    }, []); // Пустой массив зависимостей (только один раз при монтировании)

    if (isLoadingProfile) {
        return <div className="flex items-center justify-center h-screen text-xl text-gray-600">Загрузка данных...</div>;
    }

    if (loadError) {
        return <div className="flex flex-col items-center justify-center h-screen text-red-600 p-4 text-center border-4 border-red-200 m-8">
            <h1 className="font-bold mb-4">Ошибка загрузки!</h1>
            <p>{loadError}</p>
            <p className="mt-4">Убедитесь, что вы прошли команду /start в Telegram, и что ваш API-ключ БД корректен.</p>
        </div>;
    }

    if (!user) {
        // Если loadError не сработал, но user пустой, значит, пользователь не найден в БД.
        return <div className="flex items-center justify-center h-screen text-red-600 p-4 text-center">
            <h1 className="font-bold">Профиль не найден!</h1>
            <p>Пожалуйста, вернитесь в Telegram и создайте профиль командой /start.</p>
        </div>;
    }

    // Рендерим нужный вид
    if (view === 'profile') {
        return <ProfileView user={user} setView={setView} />;
    }
    
    return <ChatView user={user} setView={setView} />;
};
{/* */ }
export default App;
