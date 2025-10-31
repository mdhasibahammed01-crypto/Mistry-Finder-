



import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut, User as FirebaseAuthUser } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, orderBy, getDocs, arrayUnion, arrayRemove, where, limit, increment, documentId } from 'firebase/firestore';

import { AuthContext } from './context/AuthContext';
import { JobContext } from './context/JobContext';
import { User, UserRole, Job, UpdateJobData, Transaction, ClientProfile, WorkerProfile, Comment, Screen, ChatMessage, Notification } from './types';

import SplashScreen from './screens/SplashScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ProfileSettingsScreen from './screens/ProfileSettingsScreen';
import { LanguageContext, Language } from './context/LanguageContext';
import MyPostsScreen from './screens/MyPostsScreen';
import ClaimCreditsModal from './components/modals/ClaimCreditsModal';
import CreateJobModal from './components/modals/CreateJobModal';
import Header from './screens/common/Header';
import HomeFeed from './screens/HomeFeed';
import BottomNavBar from './screens/common/BottomNavBar';
import WorkerBottomNavBar from './screens/worker/WorkerBottomNavBar';
import SearchScreen from './screens/client/SearchScreen';
import { DashboardContent } from './screens/worker/DashboardContent';
import { FindJobsContent } from './screens/worker/FindJobsContent';
import { MyJobsContent } from './screens/worker/MyJobsContent';
import { useTranslation } from './hooks/useTranslation';
import ApplicantsScreen from './screens/client/ApplicantsScreen';
import ChatScreen from './screens/common/ChatScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import { UIContext } from './context/UIContext';
import { translations } from './translations';
import InsufficientCreditsModal from './components/modals/InsufficientCreditsModal';
import AddCreditModal from './components/modals/AddCreditModal';
import { ConversationsScreen } from './screens/common/ConversationsScreen';
import JobDetailsScreen from './screens/JobDetailsScreen';
import { ProfileContext } from './context/ProfileContext';
import WorkerProfileScreen from './screens/worker/WorkerProfileScreen';
import EditProfileModal from './components/modals/EditProfileModal';
import SettingsAndBlockedScreen from './screens/common/SettingsAndBlockedScreen';
import WorkerJobRequestsScreen from './screens/worker/WorkerJobRequestsScreen';

type Profile = ClientProfile | WorkerProfile;

const App: React.FC = () => {
  const [appLoading, setAppLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);

  const [jobs, setJobs] = useState<Job[]>([]);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<ClientProfile | WorkerProfile | null>(null);
  const [screen, setScreen] = useState<Screen>('welcome');
  const [roleForRegistration, setRoleForRegistration] = useState<UserRole>('CLIENT');
  const [roleForLogin, setRoleForLogin] = useState<UserRole | undefined>();
  const [language, setLanguage] = useState<Language>('en');
  
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [isCreateJobModalOpen, setIsCreateJobModalOpen] = useState(false);
  const { t } = useTranslation();
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [chatOriginScreen, setChatOriginScreen] = useState<Screen | null>(null);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  const [isInsufficientCreditsModalOpen, setIsInsufficientCreditsModalOpen] = useState(false);
  const [insufficientCreditsModalMessage, setInsufficientCreditsModalMessage] = useState('');
  const [isAddCreditModalOpen, setIsAddCreditModalOpen] = useState(false);

  const [navigationState, setNavigationState] = useState<any>({});
  
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  const [viewingProfile, setViewingProfile] = useState<WorkerProfile | null>(null);
  const [profileOriginScreen, setProfileOriginScreen] = useState<Screen | null>(null);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);


  const languageContextValue = useMemo(() => ({ language, setLanguage }), [language]);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !currentUser) { 
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = { id: user.uid, ...userDocSnap.data() } as User;
          setCurrentUser(userData);
          // Profile listener is now in its own useEffect, triggered by currentUser change

          setScreen(userData.role === 'CLIENT' ? 'client_home' : 'worker_dashboard');
          if (!userData.hasClaimedInitialCredits) {
            setIsClaimModalOpen(true);
          }
        }
      } else if (!user) {
        setCurrentUser(null);
        setUserProfile(null);
        setScreen('welcome');
        setNotifications([]);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []); // Removed currentUser dependency to avoid issues

  // Real-time user data listener for instant credit updates
  useEffect(() => {
    if (!currentUser?.id) return;
    const userDocRef = doc(db, 'users', currentUser.id);
    
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const updatedUserData = { id: docSnap.id, ...docSnap.data() } as User;
            setCurrentUser(updatedUserData);
        }
    });
    
    return () => unsubscribe();
  }, [currentUser?.id]);
  
  // Real-time user profile listener for instant profile updates (e.g., blocking)
  useEffect(() => {
      if (!currentUser?.profileId || !currentUser?.role) return;
      
      const collectionName = currentUser.role === 'CLIENT' ? 'clientProfiles' : 'workerProfiles';
      const profileDocRef = doc(db, collectionName, currentUser.profileId);

      const unsubscribe = onSnapshot(profileDocRef, (docSnap) => {
          if (docSnap.exists()) {
              const profileData = { id: docSnap.id, ...docSnap.data() } as ClientProfile | WorkerProfile;
              setUserProfile(profileData);
              // Also update the central profiles map
              setProfiles(prev => new Map(prev).set(profileData.id, profileData));
          }
      });
      
      return () => unsubscribe();
  }, [currentUser?.profileId, currentUser?.role]);


  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const jobsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
      setJobs(jobsData);
    });
    return () => unsubscribe();
  }, []);
  
  // New central profile fetching logic
  useEffect(() => {
    const fetchAllProfiles = async () => {
      if (jobs.length === 0) {
        setLoadingProfiles(false);
        return;
      }
      
      const profileIds = new Set<string>();
      jobs.forEach(job => {
        if (job.clientId) profileIds.add(job.clientId);
        if (job.workerId) profileIds.add(job.workerId);
        if (job.applicants) job.applicants.forEach(id => profileIds.add(id));
      });

      const uniqueIds = Array.from(profileIds);
      
      const newProfilesMap = new Map(profiles);
      const idsToFetch = uniqueIds.filter(id => id && !newProfilesMap.has(id));

      if (idsToFetch.length === 0) {
        if (loadingProfiles) setLoadingProfiles(false);
        return;
      }

      try {
        const newProfiles: Profile[] = [];
        const chunkSize = 30; // Firestore 'in' query limit is 30
        for (let i = 0; i < idsToFetch.length; i += chunkSize) {
            const chunk = idsToFetch.slice(i, i + chunkSize);
            
            const clientProfilesRef = collection(db, 'clientProfiles');
            const qClients = query(clientProfilesRef, where(documentId(), 'in', chunk));
            
            const workerProfilesRef = collection(db, 'workerProfiles');
            const qWorkers = query(workerProfilesRef, where(documentId(), 'in', chunk));

            const [clientSnapshot, workerSnapshot] = await Promise.all([
                getDocs(qClients),
                getDocs(qWorkers)
            ]);
            
            clientSnapshot.docs.forEach(doc => {
                newProfiles.push({ id: doc.id, ...doc.data() } as ClientProfile);
            });
            
            workerSnapshot.docs.forEach(doc => {
                newProfiles.push({ id: doc.id, ...doc.data() } as WorkerProfile);
            });
        }
        
        setProfiles(prev => {
          const newMap = new Map(prev);
          newProfiles.forEach(p => newMap.set(p.id, p));
          return newMap;
        });

      } catch (error) {
        console.error("Error fetching profiles:", error);
      } finally {
        setLoadingProfiles(false);
      }
    };

    fetchAllProfiles();
  }, [jobs]);

  // Notification listener
  useEffect(() => {
    if (!currentUser?.id) return;
    
    const q = query(collection(db, 'notifications'), where('userId', '==', currentUser.id));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const notifs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      notifs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setNotifications(notifs);
    }, (error) => {
        console.error("Error fetching notifications:", error);
    });

    return () => unsubscribe();
  }, [currentUser?.id]);

  // Client-side credit processing for APPROVED and REJECTED transactions
  useEffect(() => {
    if (!currentUser?.id) return;

    const transactionsRef = collection(db, 'transactions');
    const q = query(
      transactionsRef,
      where('userId', '==', currentUser.id),
      where('processed', '==', false)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) return;

      const unprocessedDocs = snapshot.docs;
      const approvedTransactions = unprocessedDocs.filter(d => d.data().status === 'APPROVED');
      const rejectedTransactions = unprocessedDocs.filter(d => d.data().status === 'REJECTED');
      
      if (approvedTransactions.length === 0 && rejectedTransactions.length === 0) {
          return;
      }

      try {
        const batch = writeBatch(db);
        let totalCreditsToAdd = 0;

        approvedTransactions.forEach(doc => {
          totalCreditsToAdd += (doc.data() as Transaction).package?.credits || 0;
          batch.update(doc.ref, { processed: true });
        });

        if (totalCreditsToAdd > 0) {
          const userDocRef = doc(db, 'users', currentUser.id);
          batch.update(userDocRef, { credits: increment(totalCreditsToAdd) });

          const approvalNotificationRef = doc(collection(db, 'notifications'));
          batch.set(approvalNotificationRef, {
            userId: currentUser.id,
            fromUserName: t('notificationSystem'),
            type: 'CREDIT_APPROVED',
            amount: totalCreditsToAdd,
            isRead: false,
            timestamp: serverTimestamp(),
          });
        }

        rejectedTransactions.forEach(transactionDoc => {
          batch.update(transactionDoc.ref, { processed: true });
          const rejectionNotificationRef = doc(collection(db, 'notifications'));
          batch.set(rejectionNotificationRef, {
            userId: currentUser.id,
            fromUserName: t('notificationSystem'),
            type: 'CREDIT_REJECTED',
            isRead: false,
            timestamp: serverTimestamp(),
          });
        });
        
        await batch.commit();
      } catch (error) {
        console.error("Credit processing batch commit failed:", error);
      }
    });

    return () => unsubscribe();
  }, [currentUser?.id, t]);

  const handleClaimCredits = useCallback(async () => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.id);
    await updateDoc(userDocRef, {
      credits: increment(50),
      hasClaimedInitialCredits: true,
    });
    setIsClaimModalOpen(false);
  }, [currentUser]);
  
  const handleRegistrationSuccess = useCallback(async (user: FirebaseAuthUser) => {
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      const userData = { id: user.uid, ...userDocSnap.data() } as User;
      setCurrentUser(userData);

      const profileDocRef = doc(db, userData.role === 'CLIENT' ? 'clientProfiles' : 'workerProfiles', userData.profileId);
      const profileDocSnap = await getDoc(profileDocRef);
      if (profileDocSnap.exists()) {
          setUserProfile({ id: profileDocSnap.id, ...profileDocSnap.data()} as ClientProfile | WorkerProfile);
      }

      setScreen(userData.role === 'CLIENT' ? 'client_home' : 'worker_dashboard');
      if (!userData.hasClaimedInitialCredits) {
        setIsClaimModalOpen(true);
      }
    } else {
        console.error("Registration success was called, but user document not found.");
        logout();
    }
  }, [logout]);


  const navigateTo = useCallback((newScreen: Screen, role?: UserRole) => {
    if (newScreen === 'register') {
        if (role) setRoleForRegistration(role);
    } else if (newScreen === 'login') {
        setRoleForLogin(role); 
    }
    setNavigationState({}); // Clear context on standard navigation
    setScreen(newScreen);
  }, []);

  const handleJobNavigation = (targetScreen: Screen, job: Job) => {
    if (targetScreen === 'chat') {
        setChatOriginScreen(screen);
    }
    setActiveJob(job);
    setScreen(targetScreen);
  };
  
  const handleProfileNavigation = (workerProfile: WorkerProfile, originScreen: Screen) => {
    setViewingProfile(workerProfile);
    setProfileOriginScreen(originScreen);
    setScreen('worker_profile');
  };

  const submitTransactionRequest = useCallback(async (data: Omit<Transaction, 'id' | 'status' | 'requestDate' | 'userId' | 'processed'>) => {
    if (!currentUser) return;
    const newTransaction = {
        ...data,
        userId: currentUser.id,
        status: 'PENDING',
        requestDate: serverTimestamp(),
        processed: false,
    };
    await addDoc(collection(db, 'transactions'), newTransaction);
  }, [currentUser]);

  const updateUserCredits = useCallback(async (userId: string, newCreditValue: number) => {
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, { credits: newCreditValue });
  }, []);

  const updateUserProfile = useCallback(async (data: Partial<ClientProfile | WorkerProfile>) => {
    if (!currentUser || !userProfile) {
        console.error("Cannot update profile: No user or profile found.");
        return;
    }

    const collectionName = currentUser.role === 'CLIENT' ? 'clientProfiles' : 'workerProfiles';
    const profileDocRef = doc(db, collectionName, currentUser.profileId);

    try {
        await updateDoc(profileDocRef, data);
        setUserProfile(prev => prev ? { ...prev, ...data } : null); // Update local state
    } catch (error) {
        console.error("Error updating profile in Firestore:", error);
        throw error;
    }
  }, [currentUser, userProfile]);

  const blockProfile = useCallback(async (profileIdToBlock: string) => {
    if (!currentUser || !userProfile) return;
    const collectionName = currentUser.role === 'CLIENT' ? 'clientProfiles' : 'workerProfiles';
    const profileDocRef = doc(db, collectionName, userProfile.id);
    await updateDoc(profileDocRef, { blockedProfiles: arrayUnion(profileIdToBlock) });
  }, [currentUser, userProfile]);

  const unblockProfile = useCallback(async (profileIdToUnblock: string) => {
    if (!currentUser || !userProfile) return;
    const collectionName = currentUser.role === 'CLIENT' ? 'clientProfiles' : 'workerProfiles';
    const profileDocRef = doc(db, collectionName, userProfile.id);
    await updateDoc(profileDocRef, { blockedProfiles: arrayRemove(profileIdToUnblock) });
  }, [currentUser, userProfile]);

  const hideConversation = useCallback(async (jobId: string) => {
    if (!currentUser || !userProfile) return;
    const collectionName = currentUser.role === 'CLIENT' ? 'clientProfiles' : 'workerProfiles';
    const profileDocRef = doc(db, collectionName, userProfile.id);
    await updateDoc(profileDocRef, { hiddenConversations: arrayUnion(jobId) });
  }, [currentUser, userProfile]);

  const unhideConversation = useCallback(async (jobId: string) => {
      if (!currentUser || !userProfile) return;
      const collectionName = currentUser.role === 'CLIENT' ? 'clientProfiles' : 'workerProfiles';
      const profileDocRef = doc(db, collectionName, userProfile.id);
      await updateDoc(profileDocRef, { hiddenConversations: arrayRemove(jobId) });
  }, [currentUser, userProfile]);


  const authContextValue = useMemo(() => ({
    currentUser,
    userProfile,
    logout,
    updateUserCredits,
    submitTransactionRequest,
    updateUserProfile,
    blockProfile,
    unblockProfile,
    hideConversation,
    unhideConversation,
  }), [currentUser, userProfile, logout, updateUserCredits, submitTransactionRequest, updateUserProfile, blockProfile, unblockProfile, hideConversation, unhideConversation]);
  
  const getUserIdFromProfileId = async (profileId: string): Promise<string | null> => {
      const q = query(collection(db, 'users'), where('profileId', '==', profileId), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
          return querySnapshot.docs[0].id;
      }
      return null;
  };

  const addJob = useCallback(async (newJobData: { clientId: string; workerId?: string; description: string; category: string; }) => {
    if (!currentUser || !userProfile) {
        throw new Error("User not authenticated");
    }

    const cost = newJobData.workerId ? 2 : 20;
    if (currentUser.credits < cost) {
      throw new Error("Insufficient credits");
    }

    const newJob = {
        ...newJobData,
        status: newJobData.workerId ? 'REQUESTED' : 'OPEN',
        date: new Date().toISOString(),
        likedBy: [],
        comments: [],
        applicants: [],
        views: 0,
    };

    const userDocRef = doc(db, 'users', currentUser.id);
    const jobsCollectionRef = collection(db, 'jobs');
    const batch = writeBatch(db);
    
    const newJobRef = doc(jobsCollectionRef);
    batch.set(newJobRef, newJob);
    batch.update(userDocRef, { credits: increment(-cost) });
    
    await batch.commit();

    if (newJobData.workerId) {
        const workerUserId = await getUserIdFromProfileId(newJobData.workerId);
        if (workerUserId) {
            await addDoc(collection(db, 'notifications'), {
                userId: workerUserId,
                fromUserName: 'firstName' in userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : userProfile.fullName,
                type: 'JOB_REQUEST',
                relatedJobId: newJobRef.id,
                relatedJobDescription: newJob.description,
                isRead: false,
                timestamp: serverTimestamp(),
            });
        }
    }
  }, [currentUser, userProfile]);
  
  const updateJob = useCallback(async (jobId: string, updatedData: UpdateJobData) => {
    const jobDocRef = doc(db, 'jobs', jobId);
    await updateDoc(jobDocRef, updatedData);
  }, []);

  const deleteJob = useCallback(async (jobId: string) => {
    const jobDocRef = doc(db, 'jobs', jobId);
    await deleteDoc(jobDocRef);
  }, []);

  const updateJobStatus = useCallback(async (jobId: string, newStatus: Job['status']) => {
    const jobDocRef = doc(db, 'jobs', jobId);
    await updateDoc(jobDocRef, { status: newStatus });
  }, []);

  const toggleLikeOnJob = useCallback(async (jobId: string) => {
    if (!currentUser) return;

    const jobDocRef = doc(db, 'jobs', jobId);
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    if ((job.likedBy || []).includes(currentUser.id)) {
      await updateDoc(jobDocRef, { likedBy: arrayRemove(currentUser.id) });
    } else {
      await updateDoc(jobDocRef, { likedBy: arrayUnion(currentUser.id) });
    }
  }, [currentUser, jobs]);

  const addCommentToJob = useCallback(async (jobId: string, commentText: string) => {
    if (!currentUser || !userProfile) return;

    const jobDocRef = doc(db, 'jobs', jobId);
    const displayName = 'firstName' in userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : userProfile.fullName;

    const newComment: Comment = {
      userId: currentUser.id,
      userName: displayName,
      text: commentText,
      date: new Date().toISOString()
    };
    
    await updateDoc(jobDocRef, { comments: arrayUnion(newComment) });
  }, [currentUser, userProfile]);

  const incrementJobView = useCallback(async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!currentUser || !job) {
        return;
    }
    
    // Don't count owner's views
    if (job.clientId === currentUser.profileId) {
        return;
    }
    
    // Don't count if already viewed
    if (job.viewedBy && job.viewedBy.includes(currentUser.id)) {
        return;
    }

    const jobDocRef = doc(db, 'jobs', jobId);
    try {
      await updateDoc(jobDocRef, {
        views: increment(1),
        viewedBy: arrayUnion(currentUser.id)
      });
    } catch (error) {
      console.error("Failed to increment job view count:", error);
    }
  }, [currentUser, jobs]);


  const applyForJob = useCallback(async (job: Job): Promise<boolean> => {
    if (!currentUser || currentUser.role !== 'WORKER' || !userProfile) return false;
    
    const cost = 20; // Hardcoded application cost
    if (currentUser.credits < cost) return false;
    
    // Prevent re-applying
    if (job.applicants?.includes(userProfile.id)) {
        console.log("User has already applied for this job.");
        return false; 
    }

    try {
      const userDocRef = doc(db, 'users', currentUser.id);
      const jobDocRef = doc(db, 'jobs', job.id);
      
      const batch = writeBatch(db);
      batch.update(userDocRef, { credits: increment(-cost) });
      batch.update(jobDocRef, { applicants: arrayUnion(userProfile.id) });
      await batch.commit();

      const clientUserId = await getUserIdFromProfileId(job.clientId);
      if (clientUserId) {
          await addDoc(collection(db, 'notifications'), {
              userId: clientUserId,
              fromUserName: (userProfile as WorkerProfile).fullName,
              type: 'NEW_APPLICANT',
              relatedJobId: job.id,
              relatedJobDescription: job.description,
              isRead: false,
              timestamp: serverTimestamp(),
          });
      }

      return true;
    } catch (error) {
      console.error("Error applying for job:", error);
      return false;
    }
  }, [currentUser, userProfile]);

  const hireWorker = useCallback(async (job: Job, workerId: string) => {
      if (!currentUser || !userProfile) {
        throw new Error("User not authenticated");
      }
      try {
        const jobDocRef = doc(db, 'jobs', job.id);
        await updateDoc(jobDocRef, {
            workerId: workerId,
            status: 'ACCEPTED',
        });
        
        const workerUserId = await getUserIdFromProfileId(workerId);
        if (workerUserId) {
          await addDoc(collection(db, 'notifications'), {
              userId: workerUserId,
              fromUserName: 'firstName' in userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : userProfile.fullName,
              type: 'HIRED',
              relatedJobId: job.id,
              relatedJobDescription: job.description,
              isRead: false,
              timestamp: serverTimestamp(),
          });
        }
      } catch (error) {
        console.error("Error hiring worker:", error);
        throw error;
      }
  }, [currentUser, userProfile]);

  const rateWorker = useCallback(async (job: Job, workerProfile: WorkerProfile, rating: number, reviewText: string) => {
    const jobDocRef = doc(db, 'jobs', job.id);
    const workerProfileDocRef = doc(db, 'workerProfiles', workerProfile.id);

    const newReviews = workerProfile.reviews + 1;
    const newRating = ((workerProfile.rating * workerProfile.reviews) + rating) / newReviews;

    const batch = writeBatch(db);

    batch.update(jobDocRef, {
        status: 'RATED',
        clientRating: rating,
        clientReviewText: reviewText,
    });

    batch.update(workerProfileDocRef, {
        rating: newRating,
        reviews: increment(1),
        totalJobsCompleted: increment(1), // Also increment completed jobs upon rating
    });

    await batch.commit();

    // Create a notification for the worker
    const workerUserId = await getUserIdFromProfileId(workerProfile.id);
    if(workerUserId && userProfile) {
      await addDoc(collection(db, 'notifications'), {
        userId: workerUserId,
        fromUserName: 'firstName' in userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : userProfile.fullName,
        type: 'JOB_RATED',
        relatedJobId: job.id,
        relatedJobDescription: job.description,
        isRead: false,
        timestamp: serverTimestamp(),
      });
    }
  }, [userProfile]);

  const getChatMessages = useCallback((jobId: string, onMessagesReceived: (messages: ChatMessage[]) => void) => {
      const messagesRef = collection(db, 'chats', jobId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const messages = querySnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
          } as ChatMessage));
          onMessagesReceived(messages);
      });
      return unsubscribe;
  }, []);

  const sendChatMessage = useCallback(async (job: Job, messageText: string) => {
      if (!currentUser || !userProfile) return;
      const messagesRef = collection(db, 'chats', job.id, 'messages');
      await addDoc(messagesRef, {
          jobId: job.id,
          senderId: currentUser.profileId,
          text: messageText,
          timestamp: serverTimestamp(),
      });
      
      const recipientProfileId = currentUser.profileId === job.clientId ? job.workerId : job.clientId;
      if (recipientProfileId) {
        const recipientUserId = await getUserIdFromProfileId(recipientProfileId);
        if (recipientUserId) {
            await addDoc(collection(db, 'notifications'), {
                userId: recipientUserId,
                fromUserName: 'firstName' in userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : userProfile.fullName,
                type: 'NEW_MESSAGE',
                relatedJobId: job.id,
                relatedJobDescription: job.description,
                isRead: false,
                timestamp: serverTimestamp(),
            });
        }
      }

  }, [currentUser, userProfile]);

  const markNotificationsAsRead = useCallback(async (type: 'message' | 'notification') => {
    const unreadNotifs = notifications.filter(n => {
        if (type === 'message') {
            return !n.isRead && n.type === 'NEW_MESSAGE';
        } else {
            return !n.isRead && n.type !== 'NEW_MESSAGE';
        }
    });

    if (unreadNotifs.length === 0) return;

    const batch = writeBatch(db);
    unreadNotifs.forEach(notif => {
        const notifRef = doc(db, 'notifications', notif.id);
        batch.update(notifRef, { isRead: true });
    });
    await batch.commit();
  }, [notifications]);
  
  const deleteNotification = useCallback(async (notificationId: string) => {
      const notifRef = doc(db, 'notifications', notificationId);
      await deleteDoc(notifRef);
  }, []);

  const deleteAllNotifications = useCallback(async () => {
      const batch = writeBatch(db);
      notifications.forEach(notif => {
          const notifRef = doc(db, 'notifications', notif.id);
          batch.delete(notifRef);
      });
      await batch.commit();
  }, [notifications]);

  const jobContextValue = useMemo(() => ({
    jobs,
    addJob,
    updateJob,
    deleteJob,
    updateJobStatus,
    toggleLikeOnJob,
    addCommentToJob,
    applyForJob,
    hireWorker,
    getChatMessages,
    sendChatMessage,
    incrementJobView,
    rateWorker,
  }), [jobs, addJob, updateJob, deleteJob, updateJobStatus, toggleLikeOnJob, addCommentToJob, applyForJob, hireWorker, getChatMessages, sendChatMessage, incrementJobView, rateWorker]);
  
  const profileContextValue = useMemo(() => ({
    profiles,
    loading: loadingProfiles,
    getProfileById: (id: string) => profiles.get(id),
  }), [profiles, loadingProfiles]);

  const openInsufficientCreditsModal = (messageKey: keyof typeof translations.en) => {
    setInsufficientCreditsModalMessage(t(messageKey));
    setIsInsufficientCreditsModalOpen(true);
  };
  
  const uiContextValue = useMemo(() => ({
    openInsufficientCreditsModal,
    openAddCreditModal: () => setIsAddCreditModalOpen(true),
  }), [t]);

  useEffect(() => {
    if (authLoading) return;
    const timer = setTimeout(() => setAppLoading(false), 500); // Small delay to avoid flash
    return () => clearTimeout(timer);
  }, [authLoading]);

  const directRequests = useMemo(() => jobs.filter(job => job.workerId === userProfile?.id && job.status === 'REQUESTED'), [jobs, userProfile?.id]);

  const renderScreen = () => {
    if (appLoading || authLoading) {
      return <SplashScreen onAnimationEnd={() => {}} />; // Let App loading control splash duration
    }

    if (!currentUser) {
      switch (screen) {
        case 'welcome':
          return <WelcomeScreen navigateTo={navigateTo} />;
        case 'login':
          return <LoginScreen navigateTo={navigateTo} role={roleForLogin} />;
        case 'register':
          return <RegisterScreen navigateTo={navigateTo} role={roleForRegistration} onRegistrationSuccess={handleRegistrationSuccess} />;
        default:
          return <WelcomeScreen navigateTo={navigateTo} />;
      }
    }
    
    // Main App for Logged-in Users
    const MainAppContent = () => {
      let content;
      switch (screen) {
        case 'client_home':
          content = <HomeFeed onCategorySelect={(categoryKey) => { setNavigationState({ preselectedCategory: categoryKey }); setScreen('client_search'); }} onNavigate={handleJobNavigation} />;
          break;
        case 'client_search':
          content = <SearchScreen preselectedCategory={navigationState.preselectedCategory} onNavigateToProfile={handleProfileNavigation} />;
          break;
        case 'my_posts':
          content = <MyPostsScreen onNavigate={handleJobNavigation} />;
          break;
        case 'applicants':
          content = activeJob ? <ApplicantsScreen job={activeJob} onBack={() => setScreen('my_posts')} onNavigateToProfile={handleProfileNavigation} /> : <MyPostsScreen onNavigate={handleJobNavigation} />;
          break;
        case 'profile_settings':
          content = <ProfileSettingsScreen onNavigate={setScreen} onEditProfile={() => setIsEditProfileModalOpen(true)} />;
          break;
        case 'worker_dashboard':
          content = <DashboardContent 
                        onNavigate={handleJobNavigation}
                        onNavigateToRequests={() => setScreen('worker_job_requests')}
                        requestCount={directRequests.length}
                    />;
          break;
        case 'worker_find_jobs':
          content = <FindJobsContent onNavigate={handleJobNavigation} />;
          break;
        case 'worker_my_jobs':
          content = <MyJobsContent onNavigate={handleJobNavigation} />;
          break;
        case 'worker_job_requests':
            content = <WorkerJobRequestsScreen onBack={() => setScreen('worker_dashboard')} directRequests={directRequests} />;
            break;
        case 'chat':
          content = activeJob ? <ChatScreen 
                                    job={activeJob} 
                                    onBack={() => setScreen(chatOriginScreen || (currentUser.role === 'CLIENT' ? 'my_posts' : 'worker_my_jobs'))} 
                                    onNavigateToProfile={(profile) => handleProfileNavigation(profile, 'chat')}
                                /> : <div>Error: No active job for chat.</div>;
          break;
        case 'notifications':
          content = <NotificationsScreen 
                        notifications={notifications} 
                        onBack={() => setScreen(currentUser.role === 'CLIENT' ? 'client_home' : 'worker_dashboard')}
                        onNavigateToJob={handleJobNavigation}
                        deleteNotification={deleteNotification}
                        deleteAllNotifications={deleteAllNotifications}
                        markNotificationsAsRead={() => markNotificationsAsRead('notification')}
                    />;
          break;
        case 'conversations':
          content = <ConversationsScreen 
                        onBack={() => setScreen(currentUser.role === 'CLIENT' ? 'client_home' : 'worker_dashboard')} 
                        onNavigateToChat={(job) => handleJobNavigation('chat', job)}
                        onNavigateToSettings={() => setScreen('settings_and_blocked')}
                        markMessagesAsRead={() => markNotificationsAsRead('message')}
                    />;
          break;
        case 'job_details':
          content = activeJob ? <JobDetailsScreen job={activeJob} onBack={() => setScreen(currentUser.role === 'CLIENT' ? 'client_home' : 'worker_find_jobs')} /> : <div>Error: No job selected.</div>;
          break;
        case 'worker_profile':
          content = viewingProfile ? <WorkerProfileScreen worker={viewingProfile} onBack={() => setScreen(profileOriginScreen || 'client_search')} /> : <div>Error: No profile to view.</div>;
          break;
        case 'settings_and_blocked':
            content = <SettingsAndBlockedScreen onBack={() => setScreen('conversations')} />;
            break;
        default:
          content = <div>Error: Unknown screen.</div>;
      }
      
      const screensWithoutHeader = ['notifications', 'conversations', 'applicants', 'chat', 'job_details', 'worker_profile', 'settings_and_blocked', 'worker_job_requests'];
      const showHeader = !screensWithoutHeader.includes(screen);
      const screensWithoutBottomNav = ['applicants', 'chat', 'notifications', 'conversations', 'job_details', 'worker_profile', 'settings_and_blocked', 'worker_job_requests'];
      const showBottomNav = !screensWithoutBottomNav.includes(screen);

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pb-20">
            {showHeader && <Header notifications={notifications} onNavigateTo={setScreen} />}
            <main className="container mx-auto p-4 sm:p-6 lg:p-8">
              {content}
            </main>
            {showBottomNav && (
              currentUser.role === 'CLIENT' 
                ? <BottomNavBar activeTab={screen} setScreen={setScreen} onAddPost={() => setIsCreateJobModalOpen(true)} />
                : <WorkerBottomNavBar activeTab={screen} setScreen={setScreen} />
            )}
        </div>
      );
    }
    
    return <MainAppContent />;
  };

  return (
    <LanguageContext.Provider value={languageContextValue}>
      <AuthContext.Provider value={authContextValue}>
        <JobContext.Provider value={jobContextValue}>
        <ProfileContext.Provider value={profileContextValue}>
        <UIContext.Provider value={uiContextValue}>
          {renderScreen()}

          {isClaimModalOpen && <ClaimCreditsModal onClose={() => setIsClaimModalOpen(false)} onConfirm={handleClaimCredits}/>}
          {isCreateJobModalOpen && <CreateJobModal onClose={() => setIsCreateJobModalOpen(false)} />}
          <InsufficientCreditsModal 
            isOpen={isInsufficientCreditsModalOpen}
            onClose={() => setIsInsufficientCreditsModalOpen(false)}
            onGoToBuyCredits={() => {
                setIsInsufficientCreditsModalOpen(false);
                setIsAddCreditModalOpen(true);
            }}
            message={insufficientCreditsModalMessage}
          />
          {isAddCreditModalOpen && <AddCreditModal onClose={() => setIsAddCreditModalOpen(false)} />}
          {isEditProfileModalOpen && <EditProfileModal onClose={() => setIsEditProfileModalOpen(false)} />}
        </UIContext.Provider>
        </ProfileContext.Provider>
        </JobContext.Provider>
      </AuthContext.Provider>
    </LanguageContext.Provider>
  );
};

export default App;