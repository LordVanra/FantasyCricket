import React, { createContext, useContext, useState, useCallback } from 'react';

const NotifyContext = createContext(null);

export const NotifyProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);

    const notify = useCallback((message, type = 'info') => {
        const id = Date.now();
        setNotifications((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
        }, 4000);
    }, []);

    return (
        <NotifyContext.Provider value={{ notify, notifications }}>
            {children}
            <div id="notification-area">
                {notifications.map((n) => (
                    <div key={n.id} className={`notification ${n.type}`}>
                        {n.message}
                    </div>
                ))}
            </div>
        </NotifyContext.Provider>
    );
};

export const useNotify = () => useContext(NotifyContext);
