// context/AuthContext.tsx
import { createContext, ReactNode, useContext, useState } from "react";
import { ADUser } from "../../../types";

type AuthContextType = {
  user: ADUser | null;
  login: (user: ADUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ADUser | null>(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        login: (u) => setUser(u),
        logout: () => setUser(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
